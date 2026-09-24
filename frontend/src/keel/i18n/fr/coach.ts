// Pack français — le namespace `coach`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `coach.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frCoach = {
  // ══════════════════════════════════════════════════════════════════════════
  // LOT 5 — L'ESPACE COACH
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ── LE REGISTRE, ET POURQUOI IL TUTOIE ────────────────────────────────────
  // La règle du dépôt (en-tête de ce fichier) place la ligne de partage à LA
  // PORTE: on vouvoie l'acheteur qu'on ne connaît pas, on tutoie la personne
  // qui est entrée. Le coach connecté est entré, et trois faits déjà livrés le
  // disent avant ce lot: `/coaches`, la page de vente qui lui est dédiée, le
  // tutoie sur ses 107 clés (« Ta formation se termine. Ton coaching, non. »);
  // `invite.dialog.session_expired`, rendue SUR `/coach`, dit « Ta session a
  // expiré »; `app.plan_untitled` dit « Ton plan ».
  //
  // Le « vous » de `/auth` n'est pas un contre-exemple: c'est le registre de la
  // PORTE, servi à tout le monde — l'élève lit lui aussi « Vous revoilà. » puis
  // entre dans une app qui le tutoie. Appliquer la même bascule au coach est la
  // règle existante, pas une exception neuve.
  //
  // « Professionnel » se porte donc par le LEXIQUE et la CONCISION, pas par le
  // pronom: pas d'exclamation, pas de pédagogie, le vocabulaire du métier
  // assumé (adhérence, siège, engagement, doctrine, portée).
  //
  // ── CE QUI EST TRADUIT ICI SANS ÊTRE SERVI ────────────────────────────────
  // Deux écrans ne sont PAS déclarés dans `PAGE_NAMESPACES` et se rendent donc
  // entièrement en anglais: `/coach/weekly` et `/coach/import`. Leurs clés sont
  // quand même écrites ci-dessous — le type `TranslatedMessages` est total sur
  // le namespace, et l'écran n'attend plus qu'une réparation SERVEUR. La raison
  // exacte de chacun est sur sa ligne dans `catalog.ts`.

  // ── Le tableau de bord du coach (`coach.dashboard.*`) ────────────────────
  // ⚠️ AUCUN LECTEUR AUJOURD'HUI: aucun écran n'appelle ces quatorze clés.
  // Elles sont traduites parce que le namespace `coach` est tout-ou-rien par
  // construction, pas parce qu'un coach les lit.
  "coach.dashboard.title": "Tes élèves",
  "coach.dashboard.subtitle": "L’adhérence de la semaine, d’un coup d’œil",
  "coach.dashboard.empty":
    "Aucun élève pour l’instant. Invite ton premier élève pour démarrer.",
  "coach.dashboard.invite_button": "Inviter un élève",
  "coach.dashboard.adherence_label": "Adhérence",
  "coach.dashboard.coverage_label": "Couverture des relevés",
  "coach.dashboard.insufficient_data": "Données insuffisantes",
  "coach.dashboard.risk.on_track": "En bonne voie",
  "coach.dashboard.risk.watch": "À surveiller",
  "coach.dashboard.risk.at_risk": "À risque",
  "coach.dashboard.risk.disengaged": "Décroché",
  // `outcome_mismatch` n'a pas de mot en français, et le calque (« écart de
  // résultat ») ne dit rien. On écrit donc le fait que le moteur mesure —
  // « following the plan, going the wrong way », dit `flagReasons.ts`.
  "coach.dashboard.risk.outcome_mismatch": "Plan tenu, résultat inverse",
  "coach.dashboard.risk.restriction_flag": "Signal de restriction",
  "coach.dashboard.last_review": "Dernier point hebdo : {date}",

  // ── L'ACCUEIL DU COACH, `/coach` (`coach.home.*`) ────────────────────────
  // Le compteur de SIÈGES est l'unité de facturation: les lignes
  // `coach_clients` en statut `active`. Invités, en pause et terminés sont
  // listés, jamais comptés — ce qui est affiché est ce qui est facturé.
  "coach.home.title": "Tes élèves",
  "coach.home.subtitle": "Tout ce que tu prescris part d’ici.",
  "coach.home.seats_label": "Sièges actifs",
  "coach.home.seats_hint":
    "Le siège actif est l’unité de facturation. Les élèves invités ou en pause ne sont pas facturés.",
  "coach.home.pending_label": "Invitations en attente",
  "coach.home.empty_title": "Invite ton premier élève",
  "coach.home.empty_body":
    "Rien ne se génère tout seul ici. Tu écris le plan, tu le publies, et l’app de ton élève se met à le suivre.",
  "coach.home.empty_cta": "Inviter un élève",
  "coach.home.open_student": "Ouvrir",
  "coach.home.list_title": "Élèves",
  // ── LES INVITATIONS EN ATTENTE ───────────────────────────────────────────
  "coach.home.invites_title": "Invités, pas encore entrés",
  "coach.home.invites_hint":
    "Rien n’existe à son nom tant qu’il n’a pas accepté. Réinviter la même adresse envoie un lien neuf et annule l’ancien.",
  "coach.home.invite_state_pending": "En attente",
  "coach.home.invite_state_expired": "Expirée",
  "coach.home.invite_expires_at": "Lien valable jusqu’au {date}",
  // « invite them again » sans genre: le français n'a pas de « them » neutre,
  // et « invite-le » aurait tranché à la place du coach. On passe par « lui »,
  // qui vaut pour les deux.
  "coach.home.invite_expired_at":
    "Lien expiré le {date} — envoie-lui une nouvelle invitation",
  "coach.home.student_unnamed": "Élève invité",
  "coach.home.student_hidden": "Nom masqué tant que ce lien n’est pas actif",
  "coach.home.student_no_name": "Pas encore de nom sur son profil",
  "coach.home.no_name_yet": "N’a pas encore créé son compte",
  "coach.home.since": "Client depuis le {date}",
  "coach.home.load_error":
    "Ta liste d’élèves n’a pas pu être chargée. On n’affiche rien plutôt que quelque chose de faux.",
  "coach.home.retry": "Réessayer",
  "coach.home.status.invited": "Invité",
  "coach.home.status.active": "Actif",
  "coach.home.status.paused": "En pause",
  "coach.home.status.ended": "Terminé",
  "coach.home.seat.billed": "Facturé",
  "coach.home.seat.trial": "Essai",
  "coach.home.seat.free": "Gratuit",
  // ── C9 · L'ESCALADE QUI ATTEND UNE DÉCISION ──────────────────────────────
  // AUCUNE COPIE NE PROMET UN BOUTON DE FERMETURE: il n'existe ni policy
  // UPDATE ni RPC pour lever le blocage. La seule sortie réelle est de mettre
  // fin au lien, et c'est ce que la phrase dit.
  "coach.home.held_title": "Retenu — en attente de ta décision",
  "coach.home.held_badge": "Retenu",
  "coach.home.held_since": "Retenu depuis le {date}",
  "coach.home.held_hint":
    "Rien n’est généré pour ces élèves tant que rien ne change. Aucun bouton ici ne lève ce blocage : coacher un mineur relève de ton cadre professionnel, pas du nôtre, donc la décision t’appartient — prends-la avec lui, ou mets fin au lien depuis sa page.",
  "coach.home.held_unreadable":
    "Les escalades ouvertes n’ont pas pu être lues. Quelqu’un attend peut-être une décision — cette liste est manquante, pas vide.",

  // ── Le garde de route du coach (`CoachRoute.tsx`) ────────────────────────
  "coach.guard.checking": "Vérification de ton accès coach…",
  "coach.guard.not_coach_title": "Cet espace est réservé aux coachs",
  "coach.guard.not_coach_body":
    "Ce compte n’a aucun profil coach actif. Si tu es élève, ton plan est dans l’app.",
  "coach.guard.suspended_title": "Ton compte coach est suspendu",
  "coach.guard.suspended_body":
    "Tant que ton compte est suspendu, tu ne peux ni lire les données de tes élèves ni publier de plan.",
  "coach.guard.signup_cta": "Créer un compte coach",
  "coach.guard.student_app_cta": "Aller à mon plan",
  "coach.guard.closed_title": "L’espace coach est fermé",
  "coach.guard.closed_body":
    "Nous nous concentrons sur les foyers en ce moment, donc les comptes coach sont en pause. Rien n’a été supprimé, et nous t’écrirons à la réouverture.",

  // ── L'OUVERTURE D'UN COMPTE COACH (`coach.signup.*`) ─────────────────────
  // ⚠️ AUCUN LECTEUR NON PLUS: l'ouverture d'un compte coach passe aujourd'hui
  // par `/auth?role=coach`, qui a ses propres clés `auth.coach.*` — et qui
  // VOUVOIE. Ces douze-ci tutoient, comme tout le lot; si un écran les
  // rallume, c'est cette couture-là qu'il faudra trancher.
  "coach.signup.title": "Crée ton compte coach",
  "coach.signup.subtitle":
    "Tes élèves ont l’app. Toi, tu as les outils de prescription. Aucun numéro de téléphone à donner.",
  "coach.signup.name_label": "Ton nom",
  "coach.signup.name_placeholder": "Le nom sous lequel tes élèves te verront",
  "coach.signup.country_label": "Pays",
  "coach.signup.country_hint":
    "Le pays où tu exerces. Il décide des ressources d’urgence et des formats locaux, et il n’est jamais déduit de ta langue.",
  "coach.signup.language_label": "Langue",
  "coach.signup.language_value": "Français",
  // L'anglais dit « The coach workspace ships in English. » — c'est FAUX
  // depuis ce lot. La phrase française énonce l'état réel, et reste vraie.
  "coach.signup.language_hint": "L’espace coach existe en français et en anglais.",
  "coach.signup.submit": "Créer mon compte coach",
  "coach.signup.switch_to_login": "J’ai déjà un compte coach",
  "coach.signup.failed":
    "Ton compte existe, mais le profil coach n’a pas pu être créé. Reconnecte-toi pour réessayer.",

  // ── LES TROIS DERNIÈRES, RANGÉES AILLEURS DANS LE SEED ───────────────────
  // `en.ts` lignes 1561-1563: elles vivent au milieu du bloc `invite.*`, parce
  // qu'elles nomment le bouton de renvoi POSÉ SUR la ligne d'invitation de
  // `/coach`. Leur clé est `coach.home.*`, leur voisinage ne l'est pas — à
  // recopier au même endroit dans `fr.ts`, entre `invite.resend_ephemeral` et
  // `invite.expired`.
  "coach.home.invite_resend": "Renvoyer",
  "coach.home.invite_resend_expired": "Envoyer un nouveau lien",
  "coach.home.invite_resending": "Envoi en cours…",

  // ── LA BIBLIOTHÈQUE DE RECETTES DU COACH (/coach/meals) ─────────────────
  // Un artefact COLLECTIF, comme la doctrine : le coach écrit un plat une fois,
  // tous ses élèves le lisent. Aucune phrase ici n’a le droit de suggérer qu’on
  // attribue un plat à quelqu’un — c’est précisément le 1:1 que le pivot a
  // retiré. « Recettes » reprend `shell.nav.meals`, déjà livré au lot 3 : le
  // titre de la page et l’onglet qui y mène doivent porter le même mot.
  "coach.meals.title": "Recettes",
  "coach.meals.subtitle":
    "Des plats que tu écris une fois. Tous tes élèves voient la même bibliothèque — tu ne composes la semaine de personne.",
  "coach.meals.loading": "Chargement de tes recettes…",
  "coach.meals.load_error":
    "Ta bibliothèque de recettes n’a pas pu être chargée. On n’affiche rien plutôt que quelque chose de faux.",
  "coach.meals.retry": "Réessayer",
  "coach.meals.no_coach_profile":
    "Ce compte n’a pas de profil coach actif : il n’y a donc aucune bibliothèque où écrire.",

  "coach.meals.add_title": "Ajouter un plat",
  "coach.meals.field_title": "Nom du plat",
  "coach.meals.field_title_hint":
    "Le nom que tu lui donnerais devant un élève. 120 caractères au maximum.",
  "coach.meals.field_description": "Comment il se prépare",
  "coach.meals.field_description_hint":
    "Facultatif. Les ingrédients et la préparation, dans tes mots. Aucune quantité n’est requise, et aucune n’est demandée.",
  "coach.meals.field_slot": "À quel moment de la journée",
  "coach.meals.field_slot_any": "Peu importe le moment",
  "coach.meals.field_slot_hint":
    "Laisse sur « peu importe le moment » sauf si le plat n’a de sens qu’à une heure précise.",
  "coach.meals.field_groups": "Ce qu’il met dans l’assiette",
  "coach.meals.field_groups_hint":
    "Le seul vocabulaire alimentaire de ce formulaire. Les quantités ne se règlent pas ici — Sophia les calcule pour chaque élève, à partir de son corps et de son objectif.",
  "coach.meals.submit": "Ajouter à la bibliothèque",
  "coach.meals.submitting": "Ajout…",
  "coach.meals.title_required": "Un plat a besoin d’un nom.",
  "coach.meals.create_failed": "Ce plat n’a pas été enregistré.",

  "coach.meals.list_title": "Ta bibliothèque",
  "coach.meals.empty_title": "Ta bibliothèque est vide",
  "coach.meals.empty_body":
    "Écris ton premier plat ci-dessus. Tes élèves le voient dès qu’il est là — tu n’as personne à qui l’attribuer.",
  // Les deux compteurs s’accordent au masculin : ils comptent des PLATS, et ils
  // sont concaténés (« 4 visibles par tes élèves · 2 archivés »).
  "coach.meals.count_active": "{count} visibles par tes élèves",
  "coach.meals.count_archived": "{count} archivés",
  // ⚠️ « Visible » s’écrit pareil dans les deux langues. Le remplacer par
  // « Affiché » perdrait l’appariement avec « Masquer aux élèves » juste en
  // dessous, qui est le geste que cette pastille décrit.
  "coach.meals.status_active": "Visible",
  "coach.meals.status_archived": "Archivé",
  "coach.meals.any_slot": "À tout moment",

  // La photo. Elle passe par `coach-recipe-image-v1` — le navigateur est
  // structurellement incapable de toucher un bucket, et l’affichage se fait par
  // URL signée courte.
  "coach.meals.photo_add": "Ajouter une photo",
  "coach.meals.photo_replace": "Remplacer la photo",
  "coach.meals.photo_uploading": "Envoi…",
  "coach.meals.photo_failed": "Cette photo n’a pas été envoyée.",
  "coach.meals.photo_alt": "Photo de {title}",
  // « MB » → « Mo » : l’unité française. Le seuil, lui, ne bouge pas.
  "coach.meals.photo_too_big": "Cette photo dépasse 5 Mo. Choisis-en une plus légère.",

  "coach.meals.archive": "Masquer aux élèves",
  "coach.meals.restore": "Réafficher",
  "coach.meals.archive_hint":
    "Masquer conserve le plat — le tien, avec sa photo. Rien ici ne supprime quoi que ce soit.",
  "coach.meals.archive_failed": "Ce changement n’est pas passé.",

  // ── LE COACH LIT L’ESPACE D’UN ÉLÈVE (/coach/clients/:id) ────────────────
  "coach.student.opening": "Ouverture de cet espace…",
  "coach.student.read_only": "Lecture seule",
  "coach.student.meal_plan_cta": "Composer les repas de cet élève",
  "coach.student.unnamed": "Élève",
  "coach.student.no_plan": "Cet élève n’a encore aucun plan publié.",
  "coach.student.plan_untitled": "Plan sans titre",
  "coach.student.denied_title": "Cet espace ne t’est pas ouvert",
  "coach.student.denied_body":
    "Un coach lit l’espace d’un élève tant que le consentement de cet élève tient. S’il l’a retiré, ou s’il n’a jamais accepté ton invitation, il n’y a rien ici — par construction, pas par erreur.",
  "coach.student.error_title": "Cet espace n’a pas pu être chargé",
  // « Tu lis, tu n’agis pas » ouvre la phrase comme en anglais : c’est le fait
  // qui protège l’élève, et il passe avant la liste de ce qui reste chez lui.
  "coach.student.footer":
    "Tu lis, tu n’agis pas, et tu lis exactement la semaine que ton élève lit. Ce qu’il écrit — ses notes sur un repas noté, ses mots dans le chat, ses photos — reste chez lui ; tu vois qu’un fait existe et ce qu’il a mesuré. Chaque ouverture de cette page est enregistrée, et visible pour lui.",

  // ── LE MESSAGE DE COHORTE ────────────────────────────────────────────────
  //
  // LA COPIE DIT « tous tes élèves », JAMAIS « certains ». C’est ce qui
  // distingue ce canal de la note par élève, et c’est aussi ce qui le rend
  // compatible avec le modèle : un geste, N destinataires.
  "coach.broadcast.title": "Un mot à tout le monde",
  "coach.broadcast.body":
    "Une fois par semaine, tu peux écrire à tous tes élèves d’un coup. Le message arrive dans leur chat, signé de ton nom. Ils ne peuvent pas y répondre — c’est toi qui parles, ce n’est pas une boîte de réception qui s’ouvre.",
  "coach.broadcast.placeholder":
    "Cette semaine, j’aimerais qu’on regarde les petits-déjeuners.",
  "coach.broadcast.recipients": "{count} élèves le recevront",
  "coach.broadcast.chars_left": "{count} caractères restants",
  "coach.broadcast.send": "Envoyer à tout le monde",
  "coach.broadcast.sending": "Envoi…",
  "coach.broadcast.sent": "C’est parti.",
  // Les deux fermetures, dites en clair. Un bouton grisé sans phrase est un
  // bouton dont le coach ne sait pas quoi faire.
  "coach.broadcast.blocked.no_recipients":
    "Aucun élève actif pour l’instant. Invite quelqu’un d’abord — il n’y a personne à qui écrire.",
  "coach.broadcast.blocked.already_sent":
    "Déjà envoyé cette semaine. Tu pourras réécrire le {date}.",
  // `skipped` n’est PAS caché : un coach qui croit que toute sa cohorte a reçu
  // est un coach qu’on trompe. Le silence n’est jamais arrondi vers le haut.
  "coach.broadcast.last_result": "Le dernier : {delivered} l’ont reçu, {skipped} non.",
  "coach.broadcast.last_pending": "Le dernier est encore en cours d’envoi.",
  "coach.broadcast.skipped_hint":
    "« Non reçu » veut le plus souvent dire qu’ils avaient déjà eu deux messages ce jour-là, ou qu’ils ont coupé les notifications. Ce n’est pas un défaut de ton côté.",
  "coach.broadcast.error": "Non envoyé — {message}",

  // ── LE SIÈGE DE CET ÉLÈVE ────────────────────────────────────────────────
  //
  // LA COPIE DIT « fin du mois » PARTOUT, et ce n’est pas une politesse : la
  // désactivation est PROGRAMMÉE, jamais immédiate, parce que l’élève a payé son
  // mois à son coach. Un libellé qui laisserait croire à une coupure instantanée
  // produirait exactement le reproche qu’on veut éviter — et c’est le COACH qui
  // le recevrait, pas nous.
  "coach.seat.title": "Le siège de cet élève",
  "coach.seat.active_body":
    "Facturé tant que cet élève est inscrit chez toi. S’il arrête de te payer, éteins le siège — il reste allumé jusqu’à la fin du mois qu’il a déjà réglé.",
  "coach.seat.deactivate_cta": "Éteindre à la fin du mois",
  // ⚠️ La bascule ferme la génération, mais `/app/*` reste atteignable. La
  // phrase promet donc l’arrêt de la MÉTHODE, jamais une coupure d’accès.
  "coach.seat.confirm_body":
    "Jusqu’à la fin du mois, rien ne change pour lui. Ensuite, il cesse de recevoir ta méthode — plus de nouvelle semaine, plus de réponses — mais il garde ce qu’il a déjà construit. Tu peux rallumer le siège quand tu veux.",
  "coach.seat.confirm_cta": "Éteindre",
  "coach.seat.confirm_cancel": "Le laisser allumé",
  "coach.seat.ending_body":
    "Extinction le {date}. Il garde l’accès complet jusque-là, et c’est le dernier mois qui te sera facturé pour lui.",
  "coach.seat.ending_undo_cta": "Finalement, garder le siège",
  "coach.seat.paused_body":
    "Éteint. Il ne reçoit plus ta méthode, et il ne t’est plus facturé. Ce qu’il a construit est conservé, son historique aussi.",
  "coach.seat.reactivate_cta": "Rallumer le siège",
  "coach.seat.working": "Enregistrement…",
  // L’intervalle de CE siège. La copie dit ce que le basculement fait ET ce
  // qu’il ne fait pas : ne rien dire sur l’absence de prorata laisserait un
  // coach croire qu’il vient de facturer douze mois.
  "coach.seat.interval_label": "Comment ce siège est facturé",
  "coach.seat.interval_month": "Au mois — 7 €",
  "coach.seat.interval_year": "À l’année — 6 €",
  "coach.seat.interval_hint":
    "Choisis l’année seulement si cet élève t’a payé l’année. Le changement prend effet à la prochaine facturation — il ne prélève ni ne rembourse rien aujourd’hui.",
  // Le motif qui n’est pas une panne : l’élève a rejoint un autre coach pendant
  // la pause, et `one_live_coach_per_student` refuse le second lien vivant.
  "coach.seat.error.already_coached":
    "Cet élève travaille maintenant avec un autre coach : son siège ne peut pas être rallumé.",
  "coach.seat.error.generic": "Non enregistré — {message}",

  // ── FF-001 — LES GESTES QUOTIDIENS DU COACH ──────────────────────────────
  // La doctrine dit comment COMPOSER ; elle ne dit nulle part quoi FAIRE tous
  // les jours. Cette carte est le seul endroit du produit où un coach peut
  // écrire « quatre verres d’eau » — une règle qui gouverne une journée et
  // qu’aucune ligne de plan ne peut porter.
  "coach.practices.title": "Ce que tu dis à tout le monde, tous les jours",
  "coach.practices.intro":
    "Les habitudes que tu répètes à chacun de tes élèves. L’une d’elles part avec leur message du soir — une différente chaque soir, dans ta voix, jamais un formulaire à remplir.",
  "coach.practices.empty":
    "Rien ici pour l’instant. Ta méthode dit comment composer une assiette ; c’est ici que tu dis quoi faire d’une journée.",
  "coach.practices.add_placeholder": "ex. Quatre verres d’eau dans la journée",
  "coach.practices.add_button": "Ajouter",
  // Le produit parle à la première personne quand il rend son verdict (« Ce que
  // j’ai compris ») : le bouton d’attente tient la même voix.
  "coach.practices.adding": "Je lis…",
  "coach.practices.full":
    "Sept, c’est le maximum qu’une rotation peut porter avant que tes élèves ne distinguent plus un soir du suivant.",
  // ⚠️ LE NOMBRE EST UNE LONGUEUR DE CYCLE, PAS UN COMPTE DE PRATIQUES. La
  // phrase ne doit donc jamais dire « tes trois pratiques partent » : une
  // pratique bloquée n’en est pas, et un fondamental compte double.
  "coach.practices.rotation_one": "Une seule pratique — elle part tous les soirs.",
  "coach.practices.rotation_many":
    "Une différente chaque soir — la rotation revient au début tous les {count} jours.",
  "coach.practices.reach_label": "Qui la reçoit :",
  // Le verdict de la classification est MONTRÉ et CORRIGEABLE : c’est la moitié
  // de la valeur du stockage.
  "coach.practices.verdict_label": "Ce que j’ai compris",
  "coach.practices.brief_label": "Ce qui est transmis :",
  "coach.practices.needs_review":
    "Je ne l’ai pas lue assez bien pour l’envoyer. Vérifie les champs ci-dessous, ou réécris la ligne et ajoute-la à nouveau.",
  "coach.practices.reclassify": "La relire",
  "coach.practices.remove": "Retirer",
  "coach.practices.askable_label": "Peut devenir une question",
  "coach.practices.askable_hint":
    "Les soirs où le message quotidien ne demande rien d’autre, celle-ci peut se terminer par une question. Jamais deux questions dans un même message.",
  "coach.practices.minor_safe_label": "Sans risque pour les élèves de moins de 18 ans",
  "coach.practices.minor_safe_hint":
    "Les mineurs reçoivent la pratique sans aucun chiffre — l’habitude, jamais la dose.",
  // « cornerstone » → « fondamental » : le mot du métier. « Pierre angulaire »
  // est juste et illisible sur une case à cocher.
  "coach.practices.constant_label": "Un de mes fondamentaux",
  "coach.practices.constant_hint":
    "Les fondamentaux reviennent à peu près deux fois plus souvent que le reste.",
  // Le libellé anglais est une amorce de phrase que la pastille complète
  // (« …who are Losing fat »). En français il devient un intitulé de champ : les
  // pastilles sont posées SOUS lui, pas à sa suite, et « Tout le monde » ne
  // complète aucune amorce.
  "coach.practices.scope_label": "Réservée à quels élèves",
  "coach.practices.blocked_title": "Celle-ci ne peut pas partir",
  "coach.practices.no_method":
    "Les pratiques voyagent dans ta voix : elles ne partent donc qu’une fois ta méthode publiée. Commence par en écrire une ci-dessus.",

  // ── /coach/protocol — la méthode du coach ────────────────────────────────
  // Un écran d'écriture de méthode qui prend vingt minutes ne sera pas rempli.
  // Chaque libellé est lu en diagonale, depuis un téléphone, entre deux clients.
  "coach.protocol.title": "Aliments recommandés",
  "coach.protocol.subtitle":
    "Les aliments avec lesquels tu construis. Touche-en un pour l’ajouter — la fréquence et le pourquoi, seulement si tu veux.",
  "coach.protocol.search_placeholder": "Chercher un aliment…",
  "coach.protocol.search_empty": "Aucun aliment ne correspond à « {query} ».",
  "coach.protocol.class.protein": "Protéines",
  "coach.protocol.class.vegetable": "Légumes",
  "coach.protocol.class.fruit": "Fruits",
  "coach.protocol.class.grain": "Céréales",
  "coach.protocol.class.legume": "Légumineuses",
  "coach.protocol.class.dairy": "Produits laitiers",
  "coach.protocol.class.fat": "Matières grasses",
  "coach.protocol.class.beverage": "Boissons",
  "coach.protocol.class.discretionary": "Plaisirs et extras",

  // « Sans avis » est une VALEUR, pas un vide : l'écrasante majorité des groupes
  // n'appelle aucune opinion, et le coach ne doit pas lire un travail inachevé.
  "coach.protocol.stance.neutral": "Sans avis",
  "coach.protocol.stance.encouraged": "Recommandé",
  "coach.protocol.stance.discouraged": "Déconseillé",
  "coach.protocol.stance.excluded": "Exclu",
  "coach.protocol.stance.hint":
    "Touche pour faire défiler : sans avis → recommandé → déconseillé → exclu.",

  // L'aperçu. Ces phrases SONT ce que Sophia vérifiera.
  "coach.protocol.preview.title": "Ce que Sophia vérifiera",
  "coach.protocol.preview.empty": "Rien pour l’instant. Touche un aliment pour commencer.",
  // « souple », « échanges autorisés » et « sans exception » sont les trois
  // niveaux d'autonomie déjà livrés (`autonomy.flexible`, `swap_within_policy`,
  // `strict`), en version courte. « strict » employé seul ne s'accorde à rien.
  "coach.protocol.preview.encourage": "{group} — au moins {n} portion par jour, souple",
  "coach.protocol.preview.discourage": "{group} — à limiter, échanges autorisés",
  "coach.protocol.preview.exclude": "{group} — à éviter, sans exception",
  "coach.protocol.preview.at_least_day": "{group} — au moins {n} par jour",
  "coach.protocol.preview.at_least_week": "{group} — au moins {n} par semaine",
  "coach.protocol.preview.at_most_day": "{group} — au plus {n} par jour",
  "coach.protocol.preview.at_most_week": "{group} — au plus {n} par semaine",
  "coach.protocol.preview.every_meal": "{group} — à chaque repas",
  "coach.protocol.preview.not_after": "{group} — pas après {time}",
  // ⚠️ « au {slot} » RENDAIT « au Petit-déjeuner », ET LA MAJUSCULE N'EST PAS
  // UNE COQUILLE DE TRADUCTION. Le trou reçoit maintenant un vrai libellé
  // (`slotLabel`, lot 5) là où il recevait le jeton brut `breakfast`, et la
  // table `slot.*` est CAPITALISÉE dans les deux langues — c'est une table
  // d'étiquettes, pas de fragments de phrase. Plutôt qu'inventer une douzième
  // table en minuscules, la phrase française met le libellé en APPOSITION
  // après le cadratin, position où la capitale est correcte. L'anglais garde
  // « at {slot} » : « at Breakfast » y passe, en français non.
  "coach.protocol.preview.at_slot": "{group} — {slot}",

  // ── Les aliments concrets — ce que le coach touche ───────────────────────
  // Un coach pense « huile de coco », pas « matière grasse ajoutée ». Court,
  // sans jargon de schéma, et jamais une injonction.
  "coach.food.pick_hint":
    "Touche un aliment pour l’ajouter à ta liste. Rien d’autre n’est obligatoire — le reste du panneau est là si tu le veux.",
  "coach.food.empty_class": "Aucun aliment ici pour l’instant.",
  "coach.food.add": "+ Ajouter un aliment",
  "coach.food.add.placeholder": "ex. kéfir, purée d’amande…",
  "coach.food.add.submit": "Ajouter",
  "coach.food.add.cancel": "Annuler",
  "coach.food.add.thinking": "On cherche où le ranger…",
  // Le rattachement n'est JAMAIS silencieux — un rattachement muet est un
  // mensonge sur ce que Sophia vérifiera vraiment.
  "coach.food.add.treated_as": "Traité comme {group}. Change-le si ce n’est pas ça.",
  "coach.food.add.failed":
    "On n’a pas trouvé où ranger « {term} ». Choisis la catégorie toi-même, ça marche pareil.",
  "coach.food.custom_badge": "à toi",
  "coach.food.remove": "Retirer de ma liste",
  "coach.food.write_failed":
    "Ce changement n’a pas été enregistré. Rien de ce que tu vois ici n’est perdu.",

  // ── Ce qu'un document du coach a dit, en attente de son arbitrage ────────
  // Un pack se nomme par un STYLE, jamais par un résultat. La copie ne promet
  // aucun effet, seulement une façon de manger — et elle dit que la liste est
  // un début, pas un avis. Le remplissage depuis la méthode ne mentionne pas
  // l'IA : ce qui compte est la SOURCE, sa méthode.
  "coach.food.fill.title": "Remplir depuis ta méthode",
  "coach.food.fill.hint":
    "Tu as déjà écrit comment tu nourris tes élèves. On le relit et on coche les aliments qui en découlent — rien de ce que tu as déjà réglé n’est touché, et tout reste modifiable.",
  "coach.food.fill.cta": "Remplir depuis ma méthode",
  "coach.food.fill.no_doctrine":
    "Écris d’abord ta méthode, ou pars d’une des listes ci-dessous.",

  "coach.food.packs.title": "Pars d’une liste, puis fais-la tienne",
  "coach.food.packs.hint":
    "Quatre façons de manger, pas quatre avis sur tes élèves. Prends celle qui ressemble le plus à ta cuisine, puis ajoute, retire et change les postures jusqu’à ce que ce soit ta liste.",
  "coach.food.packs.add": "Ajouter ces {count} aliments",
  "coach.food.packs.footer":
    "Ces listes n’ajoutent que des aliments avec lesquels tu construis. Ce que tu gardes hors de l’assiette engage bien plus qu’une liste de départ — ça, c’est à toi de le dire.",
  "coach.food.packs.reopen": "Revoir les listes de départ",

  "coach.food.proposals.title": "Depuis ton document",
  "coach.food.proposals.hint":
    "{count} aliment(s) sur lesquels ton document prend position. Rien ici n’est encore dans ta liste.",
  // « C'est de moi » / « Pas de moi » : le coach reconnaît une phrase qu'il a
  // écrite, il ne juge pas une suggestion qu'on lui ferait.
  "coach.food.proposals.accept": "C’est de moi",
  "coach.food.proposals.dismiss": "Pas de moi",
  "coach.food.proposals.footer":
    "Adopter une proposition place la phrase citée dans son « pourquoi », avec tes mots — la réécriture IA n’y touchera pas.",

  // Les trois postures. Écrites comme un coach les dit, pas comme la base les
  // stocke.
  "coach.food.stance.encouraged": "Je construis avec",
  "coach.food.stance.discouraged": "À limiter",
  "coach.food.stance.excluded": "Jamais",

  // La fréquence. Facultative, et l'écran le dit.
  "coach.food.freq.title": "À quelle fréquence",
  "coach.food.freq.none": "Aucune règle — tu n’en as pas posé, et rien ne t’y oblige.",
  "coach.food.freq.set": "Poser une règle",
  "coach.food.freq.clear": "Retirer la règle",
  "coach.food.freq.amount": "{direction} {amount} {unit} par {period}",
  "coach.food.freq.at_least": "au moins",
  "coach.food.freq.at_most": "au plus",
  "coach.food.freq.period.day": "jour",
  "coach.food.freq.period.week": "semaine",
  // « portion » est l'unité de mesure ; « part » reste ce que quelqu'un reçoit
  // dans l'assiette — la séparation tenue par le bloc `household`.
  "coach.food.freq.unit.portion.one": "portion",
  "coach.food.freq.unit.portion.many": "portions",
  // Vides, exprès, comme en anglais : « au plus 2 par jour » se lit mieux que
  // « au plus 2 unités par jour », et l'axe `count` existe précisément pour les
  // aliments qu'on compte à l'unité (œufs, fruits). ⚠️ Ces deux clés — et les
  // deux symboles juste en dessous — sont à inscrire dans les listes
  // d'exception de `parity.int.test.ts` (valeur identique / valeur vide).
  "coach.food.freq.unit.count.one": "",
  "coach.food.freq.unit.count.many": "",
  "coach.food.freq.unit.g": "g",
  "coach.food.freq.unit.ml": "ml",
  "coach.food.freq.every_meal": "À chaque repas",
  "coach.food.freq.not_after": "Pas après {time}",
  // Même raison qu'à `coach.protocol.preview.at_slot`: le libellé de créneau est
  // capitalisé, donc il se met après un deux-points au lieu d'être avalé par un
  // article. « Créneau : » et pas « Repas : » — quatre des onze créneaux
  // (`on_waking`, `pre_workout`, `before_bed`, `any_time`) ne sont pas des repas.
  "coach.food.freq.at_slot": "Créneau : {slot}",
  "coach.food.freq.tpl.amount_per_period": "Une quantité par jour ou par semaine",
  "coach.food.freq.tpl.every_meal": "À chaque repas",
  "coach.food.freq.tpl.not_after": "Pas après une heure donnée",
  "coach.food.freq.tpl.at_slot": "À un repas donné",

  // ⚠️ LA PHRASE QUI EMPÊCHE UNE GARANTIE FAUSSE. L'analyse photo rend des
  // GROUPES : une règle par aliment gouverne ce que Sophia construit et dit,
  // jamais ce qu'elle vérifie dans une assiette.
  "coach.food.freq.scope_note":
    "Une règle sur un seul aliment guide ce que Sophia construit et dit. Ce qu’elle vérifie dans une assiette, c’est la catégorie — une photo distingue une huile d’un légume, pas une huile d’une autre.",

  // Le pourquoi. Pré-rempli, éditable, et jamais écrasé une fois touché.
  "coach.food.why.title": "Pourquoi ça compte",
  "coach.food.why.placeholder": "Avec tes mots. Tes élèves le lisent sous l’aliment.",
  "coach.food.why.seeded":
    "Proposé — modifie-le, ou laisse-le : il devient le tien à la publication.",
  "coach.food.why.ai": "Écrit à partir de ta doctrine — modifie-le, ou laisse-le tel quel.",
  "coach.food.why.rewrite": "Réécrire dans ma méthode",
  "coach.food.why.rewriting": "Rédaction…",
  "coach.food.why.no_doctrine":
    "Écris d’abord tes convictions sur l’écran Doctrine — sinon ce seraient nos mots, pas les tiens.",
  "coach.food.why.failed": "On n’a pas pu l’écrire. Ton texte est intact.",

  // Les conflits de dérivation : une exclusion ne remonte PAS au niveau de la
  // catégorie quand le coach y recommande un autre aliment.
  "coach.food.conflict.title": "Catégories divisées",
  "coach.food.conflict.line":
    "{group} : tu construis avec {forList} et tu exclus {againstList}. Sophia ne vérifie rien sur la catégorie entière — les deux continuent de guider ce qu’elle construit.",

  // Objectifs : divulgation progressive. Une entrée est globale par défaut.
  "coach.protocol.goal.all": "Tout le monde",
  "coach.protocol.goal.limit": "Restreindre à un objectif",
  // Les libellés reprennent `household.goal.*`, déjà livrés — sauf
  // `recomposition`, qui dit ici ce que le générateur fait vraiment (le tour de
  // taille descend, le poids ne descend pas) plutôt que le mot de métier.
  // « Performance sportive » et pas « Performance » : le mot seul est le mot
  // anglais, et le pack refuse une valeur recopiée.

  // Les axes : des QUESTIONS, jamais des réponses. KEEL ne prescrit pas. Sans
  // article, comme en anglais : ce sont des fragments qui complètent le titre.
  "coach.protocol.axes.title": "Les méthodes comme la tienne ont en général un avis sur :",
  "coach.protocol.axes.footer": "Qu’en penses-tu ?",
  "coach.protocol.axis.protein_every_meal": "protéines à chaque repas",
  "coach.protocol.axis.added_fats": "matières grasses ajoutées",
  "coach.protocol.axis.liquid_calories": "calories liquides",
  "coach.protocol.axis.vegetable_volume": "volume de légumes",
  "coach.protocol.axis.carbs_around_training": "glucides autour de l’entraînement",
  "coach.protocol.axis.hydration": "hydratation",
  "coach.protocol.axis.eating_enough": "manger assez les jours sans appétit",
  "coach.protocol.axis.ultra_processed": "aliments ultra-transformés",

  // Brouillon et publication. Publier à l'aveugle sur une cohorte est le geste
  // le plus risqué de cet écran.
  "coach.protocol.draft.saved": "Brouillon enregistré",
  "coach.protocol.draft.saving": "Enregistrement…",
  "coach.protocol.publish": "Publier pour mes élèves",
  "coach.protocol.publish.noop":
    "Rien à publier — ton brouillon est identique à ce qui est en ligne.",
  // Le diff passe par des ÉTIQUETTES : « 1 ajoutés » n'existe pas en français,
  // et l'accord ne se décide pas dans une chaîne à trous. Les cinq faits de
  // l'anglais sont tous là, le compte d'élèves y compris.
  "coach.protocol.publish.impact":
    "Ajouts : {added} · Retraits : {removed} · Modifications : {changed} — ça change ce que Sophia vérifie pour tes élèves actifs ({students}).",
  "coach.protocol.publish.confirm": "Publier",
  "coach.protocol.publish.cancel": "Continuer à modifier",
  "coach.protocol.published_at": "En ligne depuis le {date}",
  "coach.protocol.never_published":
    "Pas encore publié. Tes élèves ne voient rien de cet écran tant que tu ne l’as pas fait.",
  "coach.protocol.load_error": "On n’a pas pu lire ta méthode. Rien n’a été modifié.",

  // ── PIVOT C5 · /coach/weekly — la lecture du lundi ───────────────────────
  // ⚠️ TRADUIT MAIS PAS SERVI: `/coach/weekly` n'est pas dans `PAGE_NAMESPACES`,
  // parce que sa première carte est le champ `coach_syntheses.narrative`, écrit
  // par une fonction qui LÈVE sur toute locale autre que l'anglais. Ces clés
  // sont là parce que le namespace `coach` doit être total, et parce que
  // l'écran n'attend plus qu'elles.
  "coach.weekly.title": "Cette semaine",
  "coach.weekly.loading": "Chargement…",
  "coach.weekly.load_error": "Ta lecture de la semaine n’a pas pu être chargée.",
  "coach.weekly.empty":
    "Aucune lecture pour l’instant. La première s’écrit le lundi qui suit les premiers relevés de tes élèves.",
  "coach.weekly.period": "Semaine du {from} au {to}",
  "coach.weekly.narrative_empty": "Rien à signaler cette semaine.",
  // « Worth a message » — pas « à surveiller ». La liste dit qui a besoin de
  // toi, jamais qui échoue, et c'est tout le produit.
  "coach.weekly.flagged_title": "À qui écrire",
  "coach.weekly.flagged_empty": "Personne ne se détache cette semaine.",
  "coach.weekly.deleted_account": "compte supprimé",
  "coach.weekly.no_number": "aucun chiffre à montrer",
  "coach.weekly.numbers_title": "Les chiffres",
  "coach.weekly.written": "Écrit le {date}",
  "coach.weekly.written_read": "Écrit le {date} · lu",
  "coach.weekly.contact.responsive": "En contact",
  "coach.weekly.contact.slipping": "S’éloigne",
  "coach.weekly.contact.silent": "Silence",

  // Les huit motifs de signalement. R2 sur la prose: ce qui a été OBSERVÉ,
  // jamais un diagnostic de la personne.
  // ⚠️ « directement » N'EST PAS UN CHOIX DE STYLE: `flagReasons.int.test.ts`
  // vérifie que la ligne de sécurité renvoie le coach vers l'élève au lieu de
  // décrire un état. Une rédaction descriptive désarmerait la consigne en
  // silence, dans la seule phrase du lot qui en est une.
  "coach.flag.restriction_signal": "Signaux de restriction — à traiter directement",
  "coach.flag.silent_5d": "N’a rien écrit depuis plusieurs jours",
  "coach.flag.slipping_contact": "S’éloigne",
  "coach.flag.week_too_hard": "A dit que la semaine avait été dure",
  "coach.flag.coverage_below_gate": "N’a presque rien noté",
  "coach.flag.no_evaluable_plan": "Rien à quoi comparer pour l’instant",
  "coach.flag.adherence_at_risk": "En difficulté sur les lignes principales",
  "coach.flag.outcome_mismatch": "Suit le plan, va dans le mauvais sens",

  // ── W10.3 · /coach/billing — ce que le coach paie, et pourquoi ───────────
  // Deux nombres, jamais fusionnés: « élèves suivis » et « sièges facturés ».
  "coach.note.section":
    "Ce que tu as remarqué chez lui",
  "coach.note.lead":
    "Facultatif. Ce que tu écris ici atteint ses plans et ses conversations avec Sophia — les horaires décalés, le genou fragile, la semaine qu'il saute toujours. Laisse vide et rien ne change.",
  "coach.note.placeholder":
    "Travaille de nuit, mange vers 3h. Déteste cuisiner le dimanche.",
  "coach.note.remaining":
    "{count} caractères restants",
  "coach.note.saved":
    "Enregistré.",
  "coach.constraints.section":
    "Ce qu'il ne peut pas manger",
  "coach.constraints.empty":
    "Rien de déclaré. Il peut ajouter lui-même ses allergies, ses intolérances et ses médicaments depuis son écran Santé.",
  "coach.constraints.medical":
    "Médical",
  "coach.constraints.added_by_you":
    "Ajouté par toi",
  "coach.billing.title": "Facturation",
  "coach.billing.subtitle": "Tu paies pour les élèves qui se sont vraiment servis du protocole.",
  "coach.billing.loading": "Chargement de ta facturation…",
  "coach.billing.load_error":
    "Ta facturation n’a pas pu être chargée. On ne montre rien plutôt que quelque chose de faux.",
  "coach.billing.retry": "Réessayer",
  "coach.billing.not_coach": "Ce compte n’a pas de profil coach, donc pas de facturation.",
  "coach.billing.seats_billed_label": "Sièges facturés ce mois-ci",
  "coach.billing.seats_billed_hint":
    "Un siège par élève rattaché. Les élèves invités et en pause ne sont jamais facturés.",
  "coach.billing.students_followed_label": "Élèves suivis",
  "coach.billing.students_followed_hint":
    "Liens actifs. Les élèves invités et en pause ne sont jamais facturés.",
  "coach.billing.plan_label": "Ton abonnement",
  "coach.billing.plan_flat": "Plateforme",
  "coach.billing.plan_seat": "Par élève actif",
  "coach.billing.status_subscribed": "Abonné",
  "coach.billing.status_trialing": "Essai gratuit",
  "coach.billing.status_expired": "Essai terminé",
  "coach.billing.status_unknown": "Aucune facturation enregistrée",
  "coach.billing.trial_days_left": "{days} jours restants, jusqu’à {seats} élèves",
  "coach.billing.trial_ended_body":
    "Ton essai est terminé. Tes élèves n’ont plus aucun accès tant que tu ne t’es pas abonné.",
  "coach.billing.renews_on": "Renouvellement le {date}",
  "coach.billing.cancels_on": "Se termine le {date}",
  "coach.billing.subscribe_monthly_cta": "S’abonner au mois",
  "coach.billing.subscribe_yearly_cta": "S’abonner à l’année",
  // Le prix se dit ici et pas dans le bouton: une phrase se relit, un libellé
  // de bouton non.
  "coach.billing.interval_hint":
    "7 € par élève et par mois, ou 6 € quand ton élève a payé à l’année. Aucun frais de plateforme.",
  "coach.billing.manage_cta": "Gérer la facturation",
  "coach.billing.checkout_error": "Le paiement n’a pas pu s’ouvrir : {message}",
  "coach.billing.ledger_title": "Ce mois-ci, élève par élève",
  "coach.billing.ledger_empty": "Aucun élève pour l’instant, donc rien de facturé.",
  "coach.billing.interactions": "{count} interactions",
  "coach.billing.interaction_one": "{count} interaction",
  "coach.billing.billed_badge": "Facturé",
  "coach.billing.not_billed_badge": "Non facturé",
  "coach.billing.invited_badge": "Invité",
  "coach.billing.paused_badge": "En pause",
  "coach.billing.student_anonymous": "Élève",
  "coach.billing.no_account_yet": "N’a pas encore créé son compte",
  "coach.billing.explainer_title": "Comment le nombre de sièges est décidé",
  "coach.billing.explainer_body":
    "Tu es facturé d’un siège par élève rattaché à toi, qu’il ait utilisé l’app ce mois-ci ou non — c’est toi qui lui vends l’accès, donc tu l’encaisses dans les deux cas. Un élève que tu as invité mais qui n’a pas rejoint n’est pas facturé, et un siège que tu as coupé non plus. On ne facture jamais un siège qu’on ne t’a pas montré ici.",
  "coach.billing.activity_hint":
    "Les interactions sont affichées pour que tu voies qui s’en sert vraiment. Elles ne décident plus de la facture — si un élève a arrêté pour de bon, coupe son siège depuis sa page.",

  // ── LES LISTES DE DÉPART: LEUR NOM ET LEUR PHRASE ─────────────────────────
  // Un STYLE, jamais un résultat: « plutôt méditerranéen » décrit une assiette,
  // « perte de gras » affirmerait quelque chose sur un corps, sous le nom du
  // coach. Les quatre noms restent donc des façons de manger.
  "coach.food.pack.mediterranean.label": "Plutôt méditerranéen",
  "coach.food.pack.mediterranean.blurb":
    "Huile d’olive, poissons gras, légumineuses et beaucoup de légumes. L’assiette que la plupart des gens imaginent quand ils pensent à bien manger sans manger bizarrement.",
  "coach.food.pack.simple_high_protein.label": "Simple et riche en protéines",
  "coach.food.pack.simple_high_protein.blurb":
    "Une protéine dans chaque assiette, un féculent qui supporte d’être cuit sans façon, des légumes qui ne demandent pas de recette. Pour ceux qui cuisinent toujours les six mêmes choses.",
  "coach.food.pack.minimal_cooking.label": "Cuisine minimale",
  "coach.food.pack.minimal_cooking.blurb":
    "Des conserves, des bocaux, et ce qui demande trois minutes ou rien. Pour les élèves dont l’obstacle est la cuisinière, pas la volonté.",
  "coach.food.pack.plant_forward.label": "Végétal d’abord",
  "coach.food.pack.plant_forward.blurb":
    "Légumineuses, soja et céréales portent l’assiette ; les œufs et les laitages y gardent leur place. Pas une liste végane — une liste où les légumes ne sont pas un accompagnement.",

  // ── C8 — LE JOURNAL ALIMENTAIRE DE L’ÉLÈVE, LU PAR SON COACH ──────────────
  // « repas » est INVARIABLE: les deux formes de `plural()` portent le même mot.
  // C’est voulu, et c’est le même arbitrage que les unités-symboles du seed —
  // la forme est décidée ici, pas par une branche de code.
  "coach.student.food.load_error":
    "Le journal alimentaire n’a pas pu être chargé pour le moment.",
  "coach.student.food.title": "Dans l’assiette — 7 derniers jours",
  "coach.student.food.empty":
    "Aucun repas lu cette semaine. La page du lundi te dit si le silence est partout, ou seulement ici.",
  // « repas » est ajouté une fois pour dire de quoi les trois nombres suivants
  // sont le compte: « légumes à 5 » seul se lit comme une note sur 5.
  "coach.student.food.summary":
    "{meals} sur {days} · légumes à {vegetables} repas · protéines à {protein} · fruits à {fruit}.",
  "coach.student.food.meal_value": "{count} repas",
  "coach.student.food.meals_value": "{count} repas",
  "coach.student.food.counts":
    "Coché comme prévu : {ticked} · mangé hors plan : {offPlan} · photographié : {photographed}.",
  "coach.student.food.seen_most": "Le plus vu : {list}",
  "coach.student.food.also_seen": "Aussi : {list}",
  "coach.student.food.dinners_large": "Dîner copieux {large} soirs sur {total}.",
  "coach.student.food.veg_trend_up": "Plus de légumes que la semaine précédente.",
  "coach.student.food.veg_trend_down": "Moins de légumes que la semaine précédente.",
  "coach.student.food.veg_trend_flat": "Autant de légumes que la semaine précédente.",
  // On nomme l’ÉCRAN de l’élève et pas l’élève: « les nombres qu’il voit »
  // aurait donné un genre à une personne dont on ne sait rien ici.
  "coach.student.food.footnote":
    "Lecture de fréquence de son journal photo — exactement les nombres affichés sur son écran. Les photos, elles, restent chez l’élève.",

  // ── C8 — LES FOURCHETTES DE DÉPART, CÔTÉ COACH SEULEMENT ──────────────────
  "coach.student.numbers.title": "Nombres de départ",
  "coach.student.numbers.empty":
    "Aucune pesée pour l’instant. Les fourchettes apparaissent après son premier point du dimanche avec un poids.",
  "coach.student.numbers.maintenance_label": "Maintien ≈",
  "coach.student.numbers.maintenance_value": "{low}–{high} kcal/jour",
  "coach.student.numbers.protein_label": "Protéines ≈",
  "coach.student.numbers.protein_value": "{low}–{high} g/jour",
  "coach.student.numbers.footnote":
    "Calculé à partir de sa seule pesée à {weight} kg — ni taille, ni âge, ni activité dans le calcul : prends-le comme la fourchette que tu ouvrirais, pas comme le nombre que tu prescrirais. Jamais déduit d’une photo, et l’élève ne voit jamais ces chiffres.",
  // ══ LE VOCABULAIRE DES OBJECTIFS — UNE TABLE, PAS TROIS ═══════════════════
  // Les trois libellés partagés par `/coach/doctrine` et `/coach/protocol`.
  // `household.goal.*` reste à part: elle s'adresse à l'ÉLÈVE, autre registre.
  // « Perte de masse grasse » et pas « perte de gras »: c'est le terme du
  // métier, et c'est déjà celui de `household.goal.fat_loss`. Le registre du
  // coach se porte par le lexique — deux mots pour le même objectif à deux
  // endroits du produit, c'est exactement le doublon que cette table supprime.
  "coach.goal.fat_loss": "Perte de masse grasse",
  "coach.goal.muscle_gain": "Prise de muscle",
  // ── LES TROIS RETIRÉS, ET OÙ EST LEUR RAISON ──────────────────────────
  // `recomposition`, `performance` et `health` avaient leur libellé ici. Le
  // socle les a retirés le 2026-08-18 (`GOAL_TOKENS`, `RETIRED_GOAL_TOKENS`
  // dans `_shared/keel/tokens.ts`, qui porte le pourquoi et le repli sur
  // `maintenance`); leurs clés sont parties le 2026-09-11. Rien ne peut plus
  // les demander: les lecteurs bouclent sur `GOAL_TOKENS`, pas sur une liste
  // écrite à côté.
  "coach.goal.maintenance": "Maintien",
  "coach.goal.everyone": "Tout le monde",
  "coach.goal.none": "Aucun objectif défini",

  // ══ FF-001 · CE QU'UNE PRATIQUE ATTEINT, ET POURQUOI ELLE EST BLOQUÉE ══════
  "coach.practice.reach.blocked": "Personne — celle-ci est bloquée",
  "coach.practice.reach.needs_review": "Personne encore — elle attend ta relecture",
  "coach.practice.reach.adults_only": "{who}, adultes uniquement",
  "coach.practice.blocked.weight_readout":
    "Ceci demande à l’élève de lire une balance. Le produit suspend l’affichage du poids pour les élèves qui montrent des signes de restriction alimentaire ; il ne peut donc pas envoyer ça tous les soirs en même temps.",
  "coach.practice.blocked.calorie_readout":
    "Ceci demande à l’élève de compter les calories. Le produit suspend l’affichage des calories pour les élèves qui montrent des signes de restriction alimentaire ; il ne peut donc pas envoyer ça tous les soirs en même temps.",
  "coach.practice.blocked.streak_display":
    "C’est une série. Le produit ne montre jamais de série à un élève — un jour manqué n’est pas un échec, et une chaîne en fait un.",
  "coach.practice.blocked.adherence_score":
    "Ceci demande à l’élève de noter sa propre observance. Le produit ne met jamais un score d’adhérence sous les yeux d’un élève.",

  // ══ `/coach/doctrine` — L'ÉCRAN ═══════════════════════════════════════════
  // ⚠️ « Doctrine » s'écrit à l'identique dans les deux langues, comme
  // `shell.nav.doctrine` déjà livrée. À ajouter à `legitimatelyIdentical`.
  "coach.doctrine.title": "Doctrine",
  "coach.doctrine.loading": "Chargement…",
  "coach.doctrine.load_failed": "Nous n’avons pas pu lire ta doctrine.",
  "coach.doctrine.action_failed": "Ça n’est pas passé.",

  "coach.doctrine.what.title": "Ce que c’est",
  "coach.doctrine.what.body":
    "Ton agent répond à tes élèves dans ta méthode et dans ta voix. C’est ici qu’il l’apprend — de tes positions sur les vrais débats de ton métier, d’un texte que tu as déjà écrit, ou d’un entretien. Jamais en te demandant de rédiger un prompt. Rien n’atteint un élève tant que tu n’as pas publié.",
  "coach.doctrine.live_badge": "En ligne",
  "coach.doctrine.live_version": "v{version} — publiée le {date}",
  "coach.doctrine.none_badge": "Rien de publié",
  "coach.doctrine.none_body":
    "Tant que tu n’as pas publié, ton agent reste volontairement prudent : il s’en tient à ce que disent déjà tes aliments recommandés et te renvoie le reste.",

  "coach.doctrine.your_method": "Ta méthode",
  "coach.doctrine.what_i_understood": "Ce que j’ai compris",
  "coach.doctrine.empty.house":
    "Tu n’en as pas écrit — tes élèves sont suivis par la méthode de Sophia, et ton agent signe « Sophia ». Écris la tienne quand tu voudras qu’il parle en ton nom.",
  "coach.doctrine.empty.own":
    "Il n’y a rien ici, donc ton agent ne porte aucune méthode de toi. Quatre chemins y mènent, et le plus rapide prend deux minutes.",
  "coach.doctrine.empty.cta_house": "Écrire ma propre méthode",
  "coach.doctrine.empty.cta_own": "Créer ma méthode",

  // « Créer » et pas « Recommencer »: le second se lit comme un bouton qui
  // efface, au-dessus du travail d'un coach.
  "coach.doctrine.create_new": "En créer une nouvelle",
  "coach.doctrine.loaded_published":
    "C’est ce que ton agent utilise en ce moment, et tu peux le modifier ici. Enregistrer crée une nouvelle version ; tes élèves continuent de lire celle-ci tant que tu n’as pas publié la nouvelle.",
  "coach.doctrine.loaded_draft":
    "C’est ta dernière version enregistrée. Elle n’est pas publiée, donc ton agent ne s’en sert pas encore.",
  "coach.doctrine.compiled_note":
    "Rien ici n’est enregistré. Si une ligne n’est pas de toi, elle n’a rien à faire là — corrige-la, ou supprime-la.",
  "coach.doctrine.dormant_title": "Personne ne lit ceci en ce moment.",
  "coach.doctrine.dormant_body":
    "Tes élèves sont suivis par la méthode de Sophia et ton agent signe « Sophia ». Tout ce qui suit reste exactement comme tu l’as laissé — reprends la main depuis le bouton du haut quand tu veux.",
  "coach.doctrine.global_scope_lead": "Tout ce que porte cette carte va à chaque élève.",
  "coach.doctrine.global_scope_body":
    "Ta voix, tes mots et tes interdits, c’est toi — ils ne se restreignent jamais à une sorte d’élève.",

  "coach.doctrine.starter.count":
    "{total} des {entries} lignes ci-dessus sont encore nos mots, à la lettre.",
  "coach.doctrine.starter.body":
    "Elles fonctionnent — mais un autre coach qui a coché les mêmes réponses a les mêmes phrases.",
  "coach.doctrine.starter.forbidden_first":
    "Commence par les phrases de remplacement : c’est le texte exact que tes élèves lisent.",
  "coach.doctrine.starter.rewrite_three":
    "En réécrire ne serait-ce que trois dans tes mots suffit à donner ta voix à l’agent.",

  "coach.doctrine.saving": "Enregistrement…",
  "coach.doctrine.save_draft": "Enregistrer le brouillon",
  "coach.doctrine.unsaved": "Tu as des modifications non enregistrées.",
  "coach.doctrine.all_saved": "Tout est enregistré.",
  "coach.doctrine.saved_notice":
    "Enregistré en brouillon. Ce n’est pas en ligne tant que tu ne l’as pas publié.",
  "coach.doctrine.published_notice":
    "La v{version} est en ligne. Le prochain message de tes élèves l’utilise.",
  // « copiée dans » et pas « revenu à »: un retour arrière COPIE dans une
  // version neuve, et le produit ne réécrit pas son historique.
  "coach.doctrine.rollback_notice":
    "v{from} copiée dans la v{to}. Publie-la pour la mettre en ligne.",
  "coach.doctrine.delegated_notice":
    "C’est fait. Tes élèves sont désormais suivis par la méthode de Sophia, et ton agent signe « {name} » dès leur prochain message. Rien de ce que tu as écrit n’a été supprimé.",
  "coach.doctrine.reclaimed_notice":
    "C’est fait. Ton agent signe de nouveau « {name} » et sert ta propre méthode publiée.",
  "coach.doctrine.your_name": "ton nom",

  // « Historique des versions » plutôt que « Versions », qui s'écrirait à
  // l'identique de l'anglais.
  "coach.doctrine.versions.title": "Historique des versions",
  "coach.doctrine.versions.empty":
    "Aucune version. Le premier enregistrement ci-dessus crée la première.",
  "coach.doctrine.draft_badge": "Brouillon",
  "coach.doctrine.versions.copied_from": "copiée de la v{version}",
  "coach.doctrine.versions.publish": "Publier",
  "coach.doctrine.versions.rollback": "Revenir à celle-ci",

  "coach.doctrine.row_remove": "Retirer",
  "coach.doctrine.section_edit": "Modifier",
  "coach.doctrine.section_done": "Terminé",
  "coach.doctrine.section_cancel": "Annuler",
  "coach.doctrine.nothing_here_yet": "Rien ici pour l’instant.",

  "coach.doctrine.beliefs.title": "Ce que tu penses",
  "coach.doctrine.beliefs.hint_global":
    "Une conviction par ligne. C’est le « pourquoi » qui permet à ton agent d’expliquer au lieu d’asséner.",
  "coach.doctrine.beliefs.hint_goal":
    "Seuls les élèves dont l’objectif est « {goal} » liront ceci.",
  "coach.doctrine.beliefs.empty_global":
    "Rien pour l’instant — qu’est-ce que tu penses, et que tu dirais à chaque élève ?",
  "coach.doctrine.beliefs.empty_goal":
    "Rien pour l’instant — que dirais-tu à un élève dont l’objectif est « {goal} » ?",
  "coach.doctrine.beliefs.rationale_label": "Pourquoi (facultatif)",
  "coach.doctrine.beliefs.add": "Ajouter une conviction",

  "coach.doctrine.answers.title": "Comment tu réponds",
  "coach.doctrine.answers.hint_global":
    "La situation, et ta phrase — mot pour mot. C’est ce qui donne ta voix à l’agent.",
  "coach.doctrine.answers.hint_goal":
    "Les cas difficiles qui ne se posent qu’avec les élèves en « {goal} ».",
  "coach.doctrine.answers.empty":
    "Rien pour l’instant — ajoute un cas difficile et la réponse que tu donnes, mot pour mot.",
  "coach.doctrine.answers.situation_label": "Quand un élève…",
  "coach.doctrine.answers.answer_label": "Tu réponds, mot pour mot",
  "coach.doctrine.answers.add": "Ajouter un cas difficile",

  "coach.doctrine.forbidden.title": "Ce que ton agent ne doit jamais dire",
  "coach.doctrine.forbidden.hint":
    "Un jeton sur lequel brancher, les formulations qu’un modèle écrirait vraiment, et — la plus importante — ce que tu dis À LA PLACE. Sans remplacement, l’élève reçoit un refus sec au lieu de ta réponse.",
  "coach.doctrine.forbidden.empty":
    "Rien pour l’instant — qu’est-ce que tu serais gêné de voir ton agent dire ?",
  "coach.doctrine.forbidden.summary_instead": "— à la place : « {instead} »",
  "coach.doctrine.forbidden.summary_no_instead": "— aucun remplacement",
  "coach.doctrine.forbidden.token_label": "La chose elle-même",
  // ⚠️ IDENTIQUE À L'ANGLAIS, ET C'EST R1 QUI L'IMPOSE. Ce champ attend un
  // JETON ASCII snake_case: le verrou déterministe branche dessus
  // (`_shared/keel/doctrine.ts`). Le traduire apprendrait au coach une forme
  // que le moteur ne reconnaît pas.
  "coach.doctrine.forbidden.token_placeholder": "six_small_meals",
  "coach.doctrine.forbidden.forms_label":
    "Comment ça s’écrit vraiment (séparé par des virgules)",
  "coach.doctrine.forbidden.forms_placeholder":
    "6 petits repas, grignoter toute la journée, manger tout le temps",
  "coach.doctrine.forbidden.reason_label": "Pourquoi tu le refuses (facultatif)",
  "coach.doctrine.forbidden.instead_label":
    "Ce que tu dis À LA PLACE — ce texte exact atteint tes élèves",
  "coach.doctrine.forbidden.no_instead_warning":
    "Aucun remplacement — l’élève reçoit ici un refus sec.",
  "coach.doctrine.forbidden.add": "Ajouter un interdit",

  "coach.doctrine.vocabulary.title": "Tes mots",
  "coach.doctrine.vocabulary.hint":
    "Les termes qui sont les tiens, et ce qu’ils veulent dire exactement.",
  "coach.doctrine.vocabulary.empty": "Rien pour l’instant — quels mots sont les tiens ?",
  "coach.doctrine.vocabulary.term_label": "Le mot",
  "coach.doctrine.vocabulary.meaning_label": "Ce qu’il veut dire",
  "coach.doctrine.vocabulary.add": "Ajouter un mot",

  "coach.doctrine.foods.title": "Les aliments que tu écartes de l’assiette",
  "coach.doctrine.foods.hint":
    "Donne aussi les formulations — « huile de graines » n’apparaît presque jamais sous ces deux mots dans une vraie phrase, et un terme nu est un filtre qui n’attrape rien. Ce avec quoi tu CONSTRUIS se règle sur ton écran Aliments recommandés, pas ici.",
  "coach.doctrine.foods.empty":
    "Rien pour l’instant — quelque chose que tu ne veux jamais voir dans une assiette ?",
  "coach.doctrine.foods.summary_also": "— aussi : {forms}",
  "coach.doctrine.foods.summary_no_forms": "— aucune formulation, difficile à attraper",
  "coach.doctrine.foods.term_label": "Aliment",
  "coach.doctrine.foods.forms_label": "Comment ça s’écrit (séparé par des virgules)",
  "coach.doctrine.foods.add": "Ajouter un aliment",

  "coach.doctrine.qa.title": "Ce que tu as déjà répondu",
  "coach.doctrine.qa.empty": "Rien pour l’instant — que te demandent tes élèves en boucle ?",
  "coach.doctrine.qa.question_label": "Ils demandent",
  "coach.doctrine.qa.answer_label": "Tu réponds",
  "coach.doctrine.qa.add": "Ajouter une question",

  "coach.doctrine.voice.title": "Ta voix",
  "coach.doctrine.voice.empty": "Rien de défini — ton agent choisit son registre.",
  "coach.doctrine.voice.address_label": "Comment tu t’adresses à eux (tu / vous)",
  "coach.doctrine.voice.language_label": "Langue dans laquelle tu écris (par ex. fr-FR)",
  "coach.doctrine.voice.length_label": "Longueur",
  "coach.doctrine.voice.length_short": "Court — deux ou trois phrases",
  "coach.doctrine.voice.length_medium": "Un court paragraphe",
  "coach.doctrine.voice.emojis_label": "Émojis",
  "coach.doctrine.voice.emojis_none": "Aucun",
  "coach.doctrine.voice.emojis_light": "Un au maximum",
  "coach.doctrine.voice.summary_address": "tu dis « {address} »",
  "coach.doctrine.voice.summary_short": "réponses courtes",
  "coach.doctrine.voice.summary_medium": "un court paragraphe",
  "coach.doctrine.voice.summary_no_emojis": "aucun émoji",
  "coach.doctrine.voice.summary_one_emoji": "un émoji au maximum",
  "coach.doctrine.voice.summary_language": "écrit en {language}",

  "coach.doctrine.specific.title": "Propre à une sorte d’élève",
  "coach.doctrine.specific.lead":
    "Ce que tu écris ici n’atteint que les élèves qui ont cet objectif.",
  "coach.doctrine.specific.body":
    "Tout ce que tu as écrit plus haut les atteint aussi — ceci s’ajoute, ça ne remplace jamais.",

  "coach.doctrine.composition.title": "Comment tu composes une assiette",
  "coach.doctrine.composition.hint":
    "Quatre questions sur ta méthode. Tes élèves n’en voient rien — ils voient les aliments.",
  "coach.doctrine.composition.empty":
    "Rien de défini — Sophia compose dans son ordre par défaut.",

  // ══ LA MODALE D'AMORÇAGE — LES QUATRE FAÇONS DE COMMENCER ═════════════════
  "coach.doctrine.start.title": "D’où vient ta méthode",
  "coach.doctrine.start.subtitle":
    "Quatre chemins d’entrée. Rien n’est enregistré ici, et rien n’atteint un élève tant que tu n’as pas publié.",
  "coach.doctrine.start.close": "Fermer",
  "coach.doctrine.start.house_now":
    "Tes élèves sont suivis en ce moment par la méthode de Sophia, et ton agent signe « Sophia ».",
  "coach.doctrine.start.house_takeback":
    "Écrire la tienne ci-dessous reprend la main : publie-la et ton agent resigne de ton nom.",

  "coach.doctrine.start.forks.title": "Répondre à un court questionnaire",
  "coach.doctrine.start.forks.who":
    "Dix sujets sur lesquels les coachs s’opposent, plus quelques lignes dans tes mots. Le chemin le plus rapide.",
  "coach.doctrine.start.forks.body":
    "Touche le camp qui est le tien, et passe ceux sur lesquels tu n’as pas de règle. Passer est une réponse : ton agent ne dit alors rien sur ce sujet au lieu de deviner.",
  "coach.doctrine.start.forks.replaces_lead":
    "Ceci écrit une nouvelle méthode et remplace celle que tu as.",
  "coach.doctrine.start.forks.replaces_body":
    "Pour compléter ce qui existe déjà, ferme cette fenêtre et utilise les crayons sur ta méthode.",
  "coach.doctrine.start.forks.voice_title": "Comment tu parles",
  "coach.doctrine.start.forks.writing": "Rédaction de ta méthode…",
  "coach.doctrine.start.forks.cta": "Écrire ma méthode",
  "coach.doctrine.start.forks.need_one": "Indique ta position sur au moins une question.",
  "coach.doctrine.start.forks.need_voice":
    "Il nous faut deux ou trois lignes dans tes mots — c’est tout l’enjeu.",
  "coach.doctrine.start.forks.answered_one":
    "{count} question répondue. Les autres restent vides, et c’est très bien.",
  "coach.doctrine.start.forks.answered_many":
    "{count} questions répondues. Les autres restent vides, et c’est très bien.",
  "coach.doctrine.start.forks.notice":
    "Relis. Ce sont tes positions — mais les mots sont les nôtres tant que tu ne les as pas réécrits, et c’est ce que dit le compteur au-dessus du bouton d’enregistrement.",
  "coach.doctrine.start.forks.tripped_lock":
    "Ce qui est revenu contredisait un de tes propres interdits, alors on l’a jeté plutôt que de l’écrire. Relance le bouton — la sortie sera différente.",
  "coach.doctrine.start.forks.garbled":
    "Celle-là est revenue illisible et on l’a laissée tomber. Relance le bouton.",

  "coach.doctrine.start.document.title": "Partir d’un texte que tu as déjà écrit",
  "coach.doctrine.start.document.who":
    "Ton ebook, ton manuel de méthode, la FAQ que tu envoies à tes nouveaux clients.",
  "coach.doctrine.start.document.body":
    "Il est lu une fois, et ce qui en sort atterrit dans ta méthode pour que tu le vérifies — rien n’est enregistré et rien n’atteint un élève tant que tu n’as pas publié.",
  "coach.doctrine.start.document.own_lead": "Dépose ton propre matériel.",
  "coach.doctrine.start.document.own_body":
    "Un manuel écrit par quelqu’un d’autre mettrait les positions d’un autre auteur dans la bouche de ton agent, sous ton nom.",
  "coach.doctrine.start.document.choose": "Choisir un PDF",
  "coach.doctrine.start.document.clear": "Effacer",
  "coach.doctrine.start.document.limits": "PDF, jusqu’à {mb} Mo et {pages} pages.",
  "coach.doctrine.start.document.reading": "Lecture en cours…",
  "coach.doctrine.start.document.add_cta": "Ajouter à ce que j’ai",
  "coach.doctrine.start.document.replace_cta": "Repartir de ce document",
  "coach.doctrine.start.document.effect":
    "Ajouter garde chaque phrase que tu as déjà et ne comble que les trous — dépose tes documents les uns après les autres. Repartir remplace tout.",
  "coach.doctrine.start.document.read_cta": "Lire mon document",
  "coach.doctrine.start.document.slow":
    "Un long document prend jusqu’à deux minutes. Laisse cet onglet ouvert.",
  "coach.doctrine.start.document.need_file": "Choisis d’abord un PDF.",
  "coach.doctrine.start.document.notice_one":
    "{count} page lue. Vérifie avant d’enregistrer — l’IA transcrit, elle ne décide pas.",
  "coach.doctrine.start.document.notice_many":
    "{count} pages lues. Vérifie avant d’enregistrer — l’IA transcrit, elle ne décide pas.",
  "coach.doctrine.start.document.foods_one":
    "{count} aliment en est ressorti et attend sur ton écran Aliments recommandés.",
  "coach.doctrine.start.document.foods_many":
    "{count} aliments en sont ressortis et attendent sur ton écran Aliments recommandés.",

  "coach.doctrine.start.interview.title": "Répondre à l’entretien complet",
  "coach.doctrine.start.interview.who":
    "Onze questions dans tes mots. Le chemin le plus long, et celui qui te ressemble le plus.",
  "coach.doctrine.start.interview.body":
    "Trois d’entre elles demandent ta phrase, mot pour mot — c’est ce qui donne ta voix à l’agent plutôt que celle d’un manuel de nutrition.",
  "coach.doctrine.start.interview.replaces_lead": "Celui-ci remplace tout ce que tu as.",
  "coach.doctrine.start.interview.replaces_body":
    "Sers-t’en pour repenser ta méthode, pas pour corriger une phrase — pour corriger une phrase, ferme cette fenêtre et modifie-la directement.",
  "coach.doctrine.start.interview.word_for_word": "Mot pour mot.",
  "coach.doctrine.start.interview.reading": "Lecture de tes réponses…",
  "coach.doctrine.start.interview.cta": "En faire ma méthode",
  "coach.doctrine.start.interview.need_one":
    "Réponds à au moins une question avant qu’on puisse te lire.",
  "coach.doctrine.start.interview.notice":
    "Relis avant d’enregistrer — l’IA transcrit, elle ne décide pas.",

  // ⚠️ CE CHEMIN NE DIT JAMAIS « ta méthode, prête à l'emploi ». Le coach doit
  // comprendre AVANT de cliquer que l'agent ne parlera pas en son nom.
  "coach.doctrine.start.delegate.title": "Laisser Sophia s’en charger",
  "coach.doctrine.start.delegate.who":
    "Pour un gérant de salle, ou pour qui veut le service sans position à défendre. Aucune question, un clic.",
  "coach.doctrine.start.delegate.body":
    "Tes élèves sont suivis par la méthode de Sophia, et c’est dit : ton agent signe « Sophia », pas ton nom.",
  "coach.doctrine.start.delegate.tradeoff":
    "Ce n’est pas ta méthode dont le travail serait fait pour toi — c’est une doublure, et tes élèves la voient comme telle. En échange, tu n’as rien à écrire ni à tenir à jour.",
  "coach.doctrine.start.delegate.effect":
    "Tant que c’est actif, ça remplace la source entière. Tout ce que tu as écrit reste exactement où c’est — ce n’est simplement plus lu — et revient dès que tu désactives.",
  "coach.doctrine.start.delegate.switching": "Bascule en cours…",
  "coach.doctrine.start.delegate.take_back": "Reprendre la main — signer de mon nom",
  "coach.doctrine.start.delegate.take_back_note":
    "Tes élèves retrouvent ta propre méthode publiée. Si tu n’en as publié aucune, ton agent répond depuis des connaissances générales et jamais en ton nom.",
  "coach.doctrine.start.delegate.hand_over": "Confier à Sophia",
  "coach.doctrine.start.delegate.hand_over_note":
    "Prend effet au prochain message de tes élèves. Tu peux reprendre la main à tout moment.",
} satisfies TranslatedMessagesOf<"coach">;
