// KEEL — le pack FRANÇAIS.
//
// ⚠️ CE FICHIER S'APPELAIT `fr.public.ts`, ET LE NOM EST TOMBÉ AVEC LE LOT 2.
// Le pack ne couvrait que la vitrine; il couvre maintenant le couloir d'entrée
// (`/join`, `/join-household`, `/app/setup`), c'est-à-dire des écrans
// authentifiés. Un fichier qui promet « public » dans son nom pendant qu'il
// traduit le tunnel d'onboarding est un fichier qu'on relit de travers.
//
// Le lot 3 y a ajouté les ATOMES (les tables jeton → mot que `api/labels.ts`
// lit dynamiquement) et la COQUILLE de l'app connectée. Ni les uns ni l'autre
// n'appartiennent à un écran: c'est pour ça qu'ils entrent avant les pages.
//
// Le lot 4 a livré CINQ ÉCRANS D'ÉLÈVE — `/app/today`, `/app/chat`,
// `/app/meals`, `/app/health`, `/app/household` — et l'essentiel de son travail
// n'a pas été de traduire mais de RAPATRIER: cinq `COPY` locaux (166 phrases)
// réimplémentaient `t()` hors du seed, donc ni la garde de `t()` ni le scanner
// de coutures ne les voyaient, et aucun de ces écrans ne pouvait basculer quoi
// qu'on écrive ici. Voir les blocs `meals`, `health` et `today` en bas.
//
// Périmètre: les namespaces listés dans `TRANSLATED_NAMESPACES` (catalog.ts), et
// EXACTEMENT eux. Le type `TranslatedMessages` est dérivé du seed anglais: une clé
// ajoutée à `en.ts` sous un namespace traduit casse la compilation de ce fichier
// tant qu'elle n'est pas traduite. C'est la seule garantie qui tienne — un
// `Partial` avec repli anglais produirait un écran français avec une phrase
// anglaise au milieu, découvert par un client et pas par un test.
//
// CE N'EST PAS UNE TRADUCTION LITTÉRALE. Les pages de vente sont réécrites pour
// sonner juste en français, pas transposées mot à mot: les tournures anglaises
// (« Your course ends. Your coaching doesn't. ») ont un rythme qui ne survit
// pas au calque. Les écrans de produit suivent la même règle pour une autre
// raison — une phrase d'interface calquée se lit comme un logiciel mal traduit,
// et c'est la première chose qu'un client remarque.
//
// Le lot 5 a écrit le pack de TOUT l'espace coach — 557 clés — et n'en a
// déclaré que CINQ écrans sur neuf. Son travail s'est partagé comme celui du
// lot 4: cinq catalogues parallèles rapatriés (`CoachBillingPage.COPY` 39
// entrées, `copy/flagReasons.ts` 8, `GOAL_LABELS` d'`api/coachDoctrine.ts` 6,
// les phrases de `api/dailyPractices.ts` 7, `GROUP_LABELS` de
// `lib/weekInFood.ts` 4) et ~220 littéraux en dur, dont une majorité dans des
// attributs `placeholder`/`title`/`aria-label` — la classe que tout le monde
// oublie. Voir le bloc « LOT 5 » en bas, et `catalog.ts` pour les quatre écrans
// qui restent anglais alors que leurs clés sont écrites: leur corps vient d'une
// fonction edge, d'un module Deno partagé ou d'une migration.
//
// ── LE REGISTRE, ET LÀ OÙ IL BASCULE ───────────────────────────────────────
// Le site n'a pas une seule adresse: `/`, `/pro`, `/couples`, `/families`,
// `/gyms`, `/communities`, `/auth` et le chrome VOUVOIENT; `/meal-prep`,
// `/coaches`, `/start`, tout le couloir d'entrée et TOUT L'ESPACE COACH
// TUTOIENT. La ligne de partage est la porte: on vouvoie l'acheteur qu'on ne
// connaît pas, on tutoie la personne qui est entrée. C'est l'arbitrage du lot 1,
// tenu tel quel — et le lot 5 l'a appliqué au coach plutôt que d'en inventer un
// second (le raisonnement complet est en tête du bloc « LOT 5 »).
//
// Ce qui NE se traduit pas: le nom de marque, l'adresse e-mail, et les prix
// (ce sont des faits commerciaux, pas de la langue).

import type { TranslatedMessages } from "./catalog";

export const fr: TranslatedMessages = {
  // ── Marque ───────────────────────────────────────────────────────────────
  "brand.wordmark": "Sophia",

  // ── Chrome public ────────────────────────────────────────────────────────
  "public.header.sign_in": "Se connecter",
  "public.header.start_trial": "Essai gratuit",
  // Le geste du foyer. « Commencer » et pas « Essai gratuit »: l'essai est une
  // notion du monde pro (14 jours, 3 élèves), et côté foyer on ne promet
  // AUCUNE durée — le tunnel de paiement n'est pas encaissable aujourd'hui.
  "public.header.start_household": "Commencer",
  "public.header.legal": "Mentions légales",
  "public.locale.label": "Langue",
  // Les deux ÉTIQUETTES ne se traduisent pas: un sélecteur de langue nomme
  // chaque langue DANS cette langue. « Anglais » écrit en français ne sert que
  // celui qui lit déjà le français — c'est-à-dire celui qui n'en a pas besoin.
  "public.locale.en": "EN",
  "public.locale.fr": "FR",
  "public.locale.switch_to_en": "Read this site in English",
  "public.language.en":
    "English",
  "public.language.fr":
    "Français",
  "public.locale.switch_to_fr": "Lire ce site en français",
  "public.header.back_to_app": "Retour à mon espace",
  "public.nav.worlds_label": "À qui s'adresse Sophia",
  "public.nav.doors_label": "Trouvez votre situation",
  // « Chez vous » et non « Pour votre foyer »: le mot foyer est administratif,
  // et l'en-tête a 71 px sur un téléphone. « Chez vous » dit la même chose,
  // plus court, et c'est ce qu'on dirait à voix haute.
  "public.nav.world_household": "Chez vous",
  "public.nav.world_pro": "Pour les pros",
  // « Batch cooking » est le terme que ce public emploie en français — la
  // recherche du segment le confirme. « Préparation de repas » décrirait la
  // même chose sans que personne ne s'y reconnaisse.
  // ⚠️ ON NOMME LA SITUATION, PAS LE SEGMENT (refonte du 2026-08-13).
  // « Meal prep », « Couples », « Families » nommaient nos TRIS. Personne ne
  // se dit « je suis un solo »; tout le monde se reconnaît dans une phrase qui
  // décrit sa cuisine. Le mot de segment reste dans le code, où il désigne une
  // branche réelle du parcours (`FunnelBranch = solo | pair | family`).
  //
  // ⚠️ CES TROIS VALEURS SONT LES MÊMES QUE `home.door.*.label`, et ce n’est pas
  // une duplication qu’on peut « factoriser »: un namespace par page, jamais de
  // clé partagée. Ce qui les tient ensemble est qu’elles se lisent À DEUX
  // CENTIMÈTRES l’une de l’autre — l’onglet de l’en-tête et la porte de la
  // clôture du hall. Les faire diverger se voit sur un seul écran.
  "public.nav.mealprep": "Pour moi seul",
  "public.nav.couples": "À deux",
  "public.nav.families": "En famille",
  "public.nav.coaches": "Formations",
  "public.nav.gyms": "Salles de sport",
  "public.nav.communities": "Communautés",
  // ⚠️ AUCUNE ADRESSE AU LECTEUR — voir la note du bloc anglais. Cette ligne
  // tutoyait (« Ta méthode, qui répond en ton absence ») sous six pages qui
  // vouvoient, et vendait une méthode à des foyers qui n’en ont pas. Ni
  // « vous » ni « tu » ne peut convenir aux huit: le registre se règle donc
  // par l’absence.
  "public.footer.legal": "Mentions légales & confidentialité",
  "public.footer.contact": "Contact",
  "public.footer.contact_email": "sophia@sophia-coach.ai",
  // ⚠️ « LOGICIEL DE COACHING » EST TOMBÉ LE 2026-09-01. La ligne ne violait
  // pas la règle du registre — elle n'adresse personne —, elle violait l'AUTRE
  // moitié: elle ne nommait qu'un seul des deux mondes. Sous les quatre pages
  // du foyer, dont aucune copie ne prononce le mot « coach », le pied de page
  // le prononçait sur les quatre. Celle-ci reprend le titre du hall
  // (`home.hero.title`) et reste vraie des deux côtés: une semaine de repas
  // décidée d'avance est ce que composent le foyer ET la méthode d'un pro.
  "public.footer.copyright": "Sophia — la semaine de repas, décidée d’avance",

  // ── /auth — LA PORTE UNIQUE DU PRODUIT ───────────────────────────────────
  //
  // ⚠️ VOUVOIEMENT — ET DEPUIS LE 2026-09-01, C'EST LA RÈGLE DE TOUT LE
  // PARCOURS DU FOYER, plus un arbitrage local. Le monde du foyer dit « vous »
  // de bout en bout: `/`, `/meal-prep`, `/couples`, `/families`, `/start`,
  // `/auth`, le chrome, ET `/app/setup`. Il ne reste `/coaches` au tutoiement,
  // qui parle à un vendeur de méthode et pas à une maison.
  // Ce qui a été mesuré avant ce lot: la porte « Pour moi seul » du hall disait
  // « VOUS savez ce que VOUS visez » et atterrissait sur « TU sais ce que TU
  // vises » — la même phrase, deux registres, un clic. Puis `/start` vouvoyait
  // et `/app/setup` retutoyait. Le registre changeait DEUX FOIS en trois
  // écrans, sur le seul chemin qui mène à un compte.
  //
  // Les quatre clés `auth.coach_link.*` plus bas ont été REPASSÉES au
  // vouvoiement pour la même raison: elles vivaient seules, tutoyantes, au
  // milieu d'un écran anglais.
  "auth.seo.title": "Connexion",
  "auth.seo.title_coach": "Compte coach",
  "auth.seo.description":
    "Connectez-vous à Sophia, ou créez le compte qui vous y fait entrer.",

  // Le fronton de la fiche — le nom du document, qui change avec son état.
  "auth.sheet.signin": "Connexion",
  "auth.sheet.coach": "Compte coach",
  "auth.sheet.reset": "Mot de passe",
  "auth.sheet.confirm": "Vérification de l’e-mail",

  "auth.signin.title": "Vous revoilà.",
  "auth.signin.lede": "La même porte, quel que soit votre compte.",
  "auth.coach.signup_title": "Créez votre compte coach.",
  "auth.coach.signup_lede":
    "Vos élèves ont l’app. Vous écrivez la méthode avec laquelle elle répond. Aucun numéro de téléphone à donner.",
  "auth.coach.signin_title": "Retour à votre espace.",
  "auth.coach.signin_lede": "Connectez-vous à votre espace coach.",
  "auth.reset.title": "Réinitialisez votre mot de passe.",
  "auth.reset.lede":
    "Indiquez votre adresse. Nous envoyons un lien qui ouvre la page où choisir un nouveau mot de passe.",

  "auth.field.email": "Adresse e-mail",
  "auth.field.password": "Mot de passe",
  "auth.field.password_show": "Afficher le mot de passe",
  "auth.field.password_hide": "Masquer le mot de passe",
  "auth.field.name": "Votre nom",
  "auth.field.name_hint": "Le nom sous lequel vos élèves vous verront.",
  "auth.field.language":
    "La langue dans laquelle vous voulez travailler",
  "auth.field.language_hint":
    "Votre espace et le coaching de vos élèves se passent dans cette langue. Vous pourrez en changer plus tard.",
  "auth.field.forgot": "Mot de passe oublié ?",

  "auth.action.signin": "Se connecter",
  "auth.action.coach_signup": "Créer mon compte coach",
  "auth.action.working": "En cours…",
  "auth.action.send_link": "Envoyer le lien",
  "auth.action.sending": "Envoi en cours…",
  "auth.action.back_to_signin": "Revenir à la connexion",

  "auth.legal.prefix": "J’accepte les",
  "auth.legal.terms": "conditions générales",
  "auth.legal.and": "et la",
  "auth.legal.privacy": "politique de confidentialité",

  "auth.prefs.title": "Préférences",
  "auth.prefs.language": "Langue",
  "auth.prefs.language_value": "Anglais",
  "auth.prefs.language_hint": "L’espace coach est en anglais.",
  "auth.prefs.timezone": "Fuseau horaire",
  "auth.prefs.tz_device": "{timezone} (appareil)",
  "auth.prefs.tz_profile": "{timezone} (profil)",
  "auth.prefs.roaming": "Itinérance",
  "auth.prefs.roaming_hint": "Suivre automatiquement le fuseau de l’appareil.",
  "auth.prefs.roaming_toggle": "Suivre le fuseau de l’appareil",

  "auth.confirm.title": "Regardez votre boîte mail.",
  "auth.confirm.body":
    "Un lien de confirmation part vers {email}. Cliquez dessus, puis revenez ici : cette page se met à jour toute seule.",
  "auth.confirm.spam": "Rien à cet endroit ? Regardez dans les indésirables.",
  "auth.confirm.waiting": "En attente de la vérification…",
  "auth.confirm.checking": "Vérification en cours…",
  "auth.confirm.check_cta": "J’ai cliqué sur le lien",
  "auth.confirm.resend": "Renvoyer l’e-mail de confirmation",
  "auth.confirm.resend_wait": "Renvoyer dans {seconds} s",
  "auth.confirm.change_email": "Utiliser une autre adresse",
  "auth.confirm.not_verified":
    "Pas encore vérifié. Cliquez sur le lien reçu par e-mail, puis revenez ici.",
  "auth.confirm.check_failed": "La vérification n’a pas pu aboutir. Réessayez.",
  "auth.confirm.verified_title": "E-mail vérifié.",
  "auth.confirm.verified_body": "Préparation de votre espace…",
  "auth.confirm.retry": "Réessayer",

  "auth.doors.divider": "Pas encore de compte ?",
  "auth.doors.household.label": "Votre compte Sophia",
  "auth.doors.household.body":
    "Ouvrez votre compte et composez votre semaine autour de qui mange à votre table.",
  "auth.doors.household.cta": "Créer un compte gratuit",
  "auth.doors.household.prompt": "Vous cuisinez chez vous ?",
  "auth.doors.pro.label": "Professionnel",
  "auth.doors.pro.body":
    "Écrivez votre méthode une fois. Vos élèves composent leur semaine dedans.",
  "auth.doors.coach_divider_signup": "Vous avez déjà un compte coach ?",
  "auth.doors.coach_divider_signin": "Pas encore de compte coach ?",

  "auth.error.legal":
    "Acceptez les conditions générales et la politique de confidentialité pour continuer.",
  "auth.error.student_signup_moved":
    "L’inscription élève a déménagé. Ouvrez /start pour créer votre compte, ou utilisez le lien que votre coach vous a envoyé.",
  "auth.error.prelaunch_signup":
    "L’inscription est fermée (pré-lancement). Connectez-vous avec le compte master_admin.",
  "auth.error.prelaunch_forbidden":
    "L’accès est restreint (pré-lancement). Seul le compte master_admin peut se connecter.",
  "auth.error.coach_profile":
    "Votre compte existe, mais le profil coach n’a pas pu être créé. Reconnectez-vous pour réessayer.",
  "auth.error.pro_closed":
    "L’espace coach est fermé pour le moment. Votre compte est intact — nous vous écrirons à sa réouverture.",
  "auth.error.server_unreachable":
    "Vous êtes bien connecté, mais le serveur ne répond pas pour ouvrir votre espace. Réessayez dans un instant.",
  "auth.error.generic": "Une erreur est survenue.",
  "auth.error.reset_failed": "L’e-mail n’a pas pu être envoyé.",
  "auth.error.reset_smtp":
    "L’e-mail de réinitialisation n’a pas pu être envoyé.\n\nSupabase Dashboard / Auth / SMTP : SMTP personnalisé activé mais incomplet, identifiants erronés, ou domaine d’expédition non vérifié.\nAuth / URL Configuration : la liste des URL de redirection autorisées doit contenir {origin}/reset-password.\n\nDétail : {detail}",
  "auth.reset.sent":
    "Si un compte existe pour {email}, un e-mail de réinitialisation est en route.",
  "auth.reset.sent_local":
    "Pile locale : ouvrez http://127.0.0.1:54324 pour le lire.",

  "auth.prelaunch.badge": "Accès restreint (pré-lancement) · master_admin uniquement",


  // ── Passerelles d'authentification ───────────────────────────────────────
  "auth.coach_link.prompt": "Vous êtes coach ?",
  "auth.coach_link.cta": "Créer un compte coach",
  "auth.coach_link.back_prompt": "Vous n’êtes pas coach ?",
  "auth.coach_link.back_cta": "Aller à la connexion classique",

  // ── /email-verified ──────────────────────────────────────────────────────
  // VOUVOIEMENT, comme tout le reste d'`auth.*`: c'est le retour du lien de
  // confirmation d'une inscription coach, et l'écran d'où l'on vient
  // (`/auth`) vouvoie. Cinq phrases qui étaient en dur, sur la page qui
  // confirme à quelqu'un que son compte existe vraiment.
  "auth.verified.title": "Adresse confirmée !",
  "auth.verified.body": "Merci d’avoir pris le temps de confirmer votre adresse.",
  "auth.verified.back_to_tab": "Vous pouvez revenir à l’onglet d’origine",
  "auth.verified.carry_on": "pour continuer.",
  "auth.verified.close_tab": "Vous pouvez fermer cet onglet.",
  "auth.verified.close_tab_maybe":
    "Si vous venez de cliquer sur le lien, vous pouvez fermer cet onglet.",

  //
  // ══ `offer` — L'OFFRE DU FOYER, ÉCRITE UNE FOIS POUR CINQ SURFACES ═══════
  //
  // Rendu par `ui/Marketing.tsx` → `OfferLines`, sur `/`, `/meal-prep`,
  // `/couples`, `/families` et `/start`. Seule exception à « un namespace par
  // page » — le pourquoi est dans `i18n/catalog.ts`.
  // ⚠️ Les montants viennent de `PRICES` par `formatPrice`, jamais du texte.
  // ⛔ « Première semaine offerte » est la durée que le produit TIENT:
  // `HOUSEHOLD_TRIAL_DAYS = 7`, aligné en SQL par
  // `keel_household_trial_days()`.
  "offer.household": "{amount} par mois pour toute la maison — votre accès est compris.",
  "offer.solo": "{amount} par mois pour une personne — toutes les fonctionnalités sont incluses.",
  "offer.extra": "{amount} par mois pour chaque autre personne qui veut son propre accès.",
  "offer.trial": "Première semaine offerte, sans code à saisir.",
  // Engagement COMMERCIAL, pas promesse de logiciel: pas de « résiliable en un
  // clic » tant qu'aucun écran ne le fait.
  "offer.no_commitment": "Sans engagement.",

  "home.seo_title": "Sophia — la semaine de repas de votre maison, décidée",
  "home.seo_description":
    "Repas, équilibre, objectifs, contraintes et courses : Sophia compose une semaine qui s’adapte à votre maison et aux imprévus.",

  // ── LE HÉROS — CE QUE C'EST, AVANT TOUT LE RESTE ─────────────────────────
  // ⚠️ LE TITRE D'AVANT ÉTAIT UN ZEUGME: « Vous savez ce que vous visez. Vos
  // dîners aussi, maintenant. » — il fallait résoudre une figure de style pour
  // comprendre, et « vos dîners aussi » n'avait aucun référent lisible. Le
  // chapô, lui, annonçait « sept choses » sans avoir jamais dit ce que le
  // produit FAIT. Verbatim du lecteur: « on comprend pas ce que ça fait ».
  // Un hall nomme son objet avant de le vendre.
  "home.hero.kicker": "Les repas de la maison",
  "home.hero.title": "Une semaine de repas, décidée.",
  "home.hero.lede":
    "Les repas, les jours de cuisine et les courses sont décidés ensemble. Les objectifs et les contraintes de chacun cohabitent, puis Sophia recale le plan quand la semaine ne se passe pas comme prévu.",
  // ⚠️ UN SEUL LIBELLÉ DE CTA EN PAGE (2026-09-01), comme le demande
  // `BRIEF-LANDING-FOYER.md` §8 (« un seul, répété »). Le site en portait
  // QUATRE pour un seul geste: « Commencer » sur trois pages, « Composer
  // votre première semaine » sur `/families`, « Créer mon compte » sur
  // `/start`. « Commencer » ne dit pas ce qui arrive après le clic; celui-ci
  // le dit, et c'est exactement ce que fait l'étape suivante.
  // ⚠️ LE BOUTON DE L'EN-TÊTE GARDE « Commencer », ET C'EST MESURÉ: le bloc
  // de droite du chrome fait déjà 275 px déconnecté, et sous `sm` il partage
  // la ligne avec le NOM de la page. Un libellé de 31 signes y ferait tomber
  // le nom à une ellipse sur tous les téléphones. Un chip d'en-tête et un CTA
  // de page ne sont pas le même objet.
  "home.hero.cta": "Composer votre première semaine",
  // ⚠️ `home.hero.price` A ÉTÉ RETIRÉE LE 2026-09-01. Elle écrivait le tarif
  // en toutes lettres, comme trois autres pages l'écrivaient chacune à sa
  // façon — et les quatre ne disaient pas la même offre. L'offre est
  // désormais UNE source: le namespace `offer`, rendu par
  // `ui/OfferLines.tsx` sur les cinq surfaces du foyer, montants pris dans
  // `PRICES`. (Le maître n'est toujours pas facturé et COMPTE quand même
  // dans le plafond de huit — ce fait vit dans le commentaire de
  // `HomePage.tsx`, à côté du bloc qui le rend.)
  // ⚠️ Ne nomme plus le « programme du coach maison »: le mot coach n'apparaît
  // nulle part ailleurs sur cette page, et collé au bouton il faisait dépendre
  // l'entrée d'un tiers dont le lecteur n'a jamais entendu parler.
  // ⚠️ `home.hero.reserve` RETIRÉE LE 2026-09-01. Elle disait « l'inscription
  // libre n'est pas toujours ouverte » SOUS LE PREMIER BOUTON DU SITE — la
  // première objection posée avant le premier bénéfice. Et elle annonçait un
  // état que `/start` affiche déjà pour de vrai (`keel_free_signup_available`
  // → écran `unavailable`). Elle n'a pas déménagé: elle n'avait plus de
  // travail à faire.

  // ── L'AIGUILLAGE — MONTÉ EN DEUXIÈME POSITION ────────────────────────────
  // Chaque porte porte TROIS choses: pour qui, ce qu'elle promet (le titre de
  // la page derrière, mot pour mot), et ce qu'on y gagne. Une porte qui ne dit
  // pas ce qu'il y a derrière ne s'ouvre pas.
  "home.doors.title": "Pour qui faut-il composer ?",
  "home.doors.aria_label": "Choisir la situation qui vous correspond",
  "home.doors.lede":
    "Choisissez votre situation : la page suivante vous montre exactement comment Sophia travaille pour vous.",
  "home.door.solo.who": "Pour moi seul",
  // ⚠️ RECOPIE LE `<h1>` DE `/meal-prep`, MOT POUR MOT — c'est la règle du
  // bloc: une porte promet le titre de la page derrière. Elle disait « Un
  // objectif n'est pas un repas » tant que l'objectif était le héros de cette
  // page; depuis le 2026-09-01 le héros est la charge mentale, et l'objectif
  // est descendu en troisième bande. La porte suit son titre.
  "home.door.solo.label": "Vos repas de la semaine, planifiés en une fois.",
  // ⚠️ NE PRÉSUME PLUS QUE LE LECTEUR FAIT DÉJÀ DU BATCH COOKING. La version
  // d'avant ouvrait sur « Vous cuisinez déjà une fois pour plusieurs jours » —
  // une affirmation sur LUI, invérifiable, et fausse pour la plupart des gens
  // qui arrivent. Une porte décrit ce qu'on trouve derrière, pas ce que le
  // visiteur est censé être.
  // ⚠️ SUIT LE NOUVEL ORDRE DE LA PAGE (2026-09-01). Elle ouvrait sur
  // l'objectif (« Vous savez ce que vous visez ») quand l'objectif était le
  // héros de `/meal-prep`. Il y est maintenant la TROISIÈME bande: une porte
  // qui annonce ce qu'on trouve au tiers de la page fait manquer les deux
  // premiers tiers. Elle dit donc ce que la page dit en premier — et garde
  // l'objectif en fin de phrase, parce qu'il reste une vraie raison d'entrer.
  "home.door.solo.gain":
    "Les repas, les jours de cuisine et les courses sont décidés une fois pour la semaine. Si vous avez un objectif, les portions s’y adaptent.",
  "home.door.pair.who": "À deux",
  // ⚠️ RECOPIE LE `<h1>` DE `/couples`, MOT POUR MOT. Elle disait « Deux
  // objectifs. Une seule cuisson. » tant que c'était le titre de la page;
  // depuis le 2026-09-01 le héros est la charge mentale à deux.
  "home.door.pair.label": "Le plus dur, c’est de se mettre d’accord.",
  // ⚠️ « UN SEUL PLAT » ÉTAIT FAUX, et vérifiable comme tel: `mergeLadder`
  // (`household_merge.ts:599-616`) calcule TROIS formes — `one_dish`,
  // `one_session`, `separate_sessions`. Le plat unique n'est qu'un cas sur
  // trois; ce qui est vrai dans les trois, c'est UNE SEULE CUISSON. Et le fait
  // que le produit TRANCHE entre les trois est un argument, pas une réserve.
  // ⚠️ SUIT LE NOUVEL ORDRE DE LA PAGE (2026-09-01), comme la porte solo. Elle
  // ouvrait sur la cohabitation des objectifs — ce que `/couples` dit
  // maintenant en TROISIÈME bande. Une porte qui annonce ce qu'on trouve au
  // milieu de la page fait manquer le début.
  // ⚠️ « un seul plat quand c'est possible, deux quand ça ne l'est pas » reste
  // vrai au mot près: c'est `mergeLadder`, et la démonstration de la page le
  // calcule en direct.
  "home.door.pair.gain":
    "Vous ne redécidez plus le repas chaque soir. Vos deux objectifs sont pris en compte : un seul plat quand c’est possible, deux dans la même session de cuisine quand c’est nécessaire.",
  "home.door.family.who": "En famille",
  // ⚠️ LE TITRE DE `/families` NE TIENT PAS SUR UNE PORTE. « Vous ne cuisinez
  // pas trop. Vous décidez trop. » a besoin d'être posé pour se comprendre — il
  // l'est sur sa page, il ne l'est pas sur une tuile de trois lignes. Une porte
  // doit se lire sans mise en place.
  "home.door.family.label": "Chacun ses besoins. Une seule cuisson.",
  // ⚠️ La porte recopie la clôture de `/families`, donc elle suit: l'ÉQUILIBRE.
  "home.door.family.gain":
    "Un ado qui fait du sport, un difficile, quelqu’un qui fait attention. Le plan est composé pour chacun, sur son âge et son corps — vous n’avez plus à vous demander si vous mangez équilibré.",

  // ── CE QUI EST VRAI DANS LES TROIS CAS, ET RIEN D'AUTRE ──────────────────
  // Règle de tri: un champ ne reste ici que s'il vaut pour les TROIS acheteurs.
  // L'objectif dans l'assiette, la part de chacun, les bouches sans compte et
  // le profil réclamé sont descendus chez le leur.
  "home.fiche.kicker": "Ce que Sophia prend en charge",
  "home.arguments.title": "Quatre façons de vous simplifier les repas de la semaine.",
  "home.benefits.pause": "Mettre en pause",
  "home.benefits.resume": "Relancer",

  // ⚠️ PREMIER CHAMP DE LA SECTION, ET C'EST VOULU: c'est l'argument le plus
  // fort, et le seul que les concurrents ne peuvent pas tenir. Il manquait —
  // la section ne parlait que d'organisation.
  // ⛔ LA LIGNE À NE PAS FRANCHIR: on dit que le plan est COMPOSÉ POUR chacun,
  // jamais qu'on rend un BILAN SUR quelqu'un. Aucune garantie (« à coup sûr »,
  // « tous les apports »), aucun chiffre, aucune courbe. Le doute se retire,
  // il ne se mesure pas — un tableau de bord sur un enfant de douze ans rendrait
  // une mère PLUS inquiète.
  "home.balance.pain": "L’équilibre nutritionnel",
  "home.balance.title": "Des repas complets, adaptés à chaque personne.",
  "home.balance.body":
    "Sophia compose chaque repas avec une protéine, un féculent et des légumes. Elle adapte ensuite les proportions et la quantité à l’âge, au corps et à l’objectif de la personne qui mange. Vous n’avez rien à recalculer au moment de servir.",
  "home.balance.figure.label": "Dans chaque assiette",
  "home.balance.figure.protein": "Une protéine",
  "home.balance.figure.starch": "Un féculent",
  "home.balance.figure.vegetables": "Des légumes",
  "home.balance.figure.note": "Les trois composantes restent présentes ; leurs proportions et la quantité s’adaptent à la personne.",

  "home.sessions.pain": "L’organisation de la semaine",
  "home.sessions.title": "La question des repas se règle une fois, courses comprises.",
  "home.sessions.body":
    "Sophia ne donne pas seulement des idées de recettes. Elle compose les repas, place les sessions de cuisine sur les jours possibles et prépare les passages de courses au bon moment. Vous validez une organisation complète au lieu de recommencer chaque soir.",
  "home.organize.figure.label": "Une seule décision, toute la semaine",
  "home.organize.figure.meals": "Les repas sont choisis",
  "home.organize.figure.meals_note": "Sept jours qui se suivent, pas sept suggestions isolées.",
  "home.organize.figure.cooking": "Les cuissons sont placées",
  "home.organize.figure.cooking_note": "Le bon jour, dans le temps que vous avez réellement.",
  "home.organize.figure.shopping": "Les courses suivent le plan",
  "home.organize.figure.shopping_note": "Un ou deux passages, placés avant les cuissons prévues.",

  "home.waves.pain":
    "On achète au hasard, on jette la moitié, et il manque toujours quelque chose.",
  // ⚠️ LE MOT « VAGUE » NE S'EMPLOIE PLUS AVANT D'ÊTRE NOMMÉ (2026-09-01).
  // C'est le hall: le lecteur y arrive sans rien savoir du produit, et il
  // tombait sur « les courses tombent en vagues » — une métaphore maison
  // employée en TITRE, expliquée nulle part avant. Le titre dit maintenant la
  // chose, et le mot est gardé pour les pages où il a été présenté.
  "home.waves.title": "Les courses en un ou deux passages",
  // ⚠️ DISAIT LA RÈGLE, PAS CE QU'ELLE DONNE. « Un produit frais s'achète au
  // plus tôt trois jours avant la casserole » énonce `MAX_FRIDGE_DAYS = 3` du
  // point de vue du moteur — vrai, et sans intérêt pour qui lit. Ce qui se voit
  // dans une vie, c'est le nombre de passages et leur moment.
  "home.waves.body":
    "Un ou deux passages dans la semaine, chacun placé avant la cuisson qu’il doit permettre.",

  "home.cohabit.kicker": "Deux personnes, sans compromis forcé",
  "home.cohabit.title": "Deux objectifs et deux contraintes peuvent vivre dans la même cuisine.",
  "home.cohabit.body":
    "Prendre du muscle d’un côté, perdre du gras de l’autre. Manger végétarien, ne pas aimer le poisson. Sophia cherche d’abord ce qui peut rester commun, puis sépare seulement ce qui doit l’être — souvent dans la même session de cuisine.",
  "home.demo.aria_label": "Démonstration interactive de deux objectifs et contraintes qui cohabitent",
  "home.demo.kicker": "Essayez une combinaison",
  "home.demo.person_a": "Personne A",
  "home.demo.person_b": "Personne B",
  "home.demo.goal_legend": "Son objectif",
  "home.demo.food_legend": "Ce qui compte pour elle",
  "home.demo.goal.fat_loss": "Perdre du gras",
  "home.demo.goal.muscle_gain": "Prendre du muscle",
  "home.demo.goal.maintenance": "Maintenir",
  "home.demo.food.everything": "Mange de tout",
  "home.demo.food.vegetarian": "Végétarien",
  "home.demo.food.no_fish": "N’aime pas le poisson",
  "home.demo.output_label": "Ce que Sophia compose",
  "home.demo.output.one_dish": "Un plat commun, deux assiettes différentes.",
  "home.demo.output.two_dishes": "Deux plats, dans une seule session de cuisine.",
  "home.demo.reason.shared": "Les deux demandes tiennent dans la même préparation ; seule la façon de servir change.",
  "home.demo.reason.vegetarian": "La préparation commune devient végétarienne : tout le monde peut la manger, puis chaque assiette suit son objectif.",
  "home.demo.reason.no_fish": "Le poisson sort de la préparation commune ; la semaine garde les deux objectifs sans remettre cet aliment au menu.",
  "home.demo.reason.goal_split": "Un même plat ne peut pas fournir les deux portions prévues : Sophia ajoute un second plat, préparé pendant la même session de cuisine.",
  "home.demo.reason.diet_split": "La contrainte commune retire ce dont l’un des objectifs a besoin : Sophia ajoute un second plat dans la même cuisson.",
  "home.demo.cooking_session": "1 session de cuisine",
  "home.demo.direction.fat_loss": "Légumes généreux, protéine entière, féculent plus petit.",
  "home.demo.direction.muscle_gain": "Protéine et féculent plus grands, mêmes légumes.",
  "home.demo.direction.maintenance": "Une part équilibrée de chaque composant.",

  "home.chat.pain": "Le plan adaptatif",
  // ⚠️ LE TITRE NE DISAIT PLUS QU'IL S'AGIT D'UNE CONVERSATION. En retirant
  // « une conversation » du titre, la version d'avant décrivait un service sans
  // jamais dire par quel geste on s'en sert — et « la réponse vaut pour votre
  // soir à vous » ne se comprenait pas.
  "home.chat.title": "Un loupé déplace la semaine ; il ne la détruit pas.",
  "home.chat.body":
    "Un repas saute, une cuisson n’a pas lieu, les courses sont repoussées : vous le dites à Sophia. Elle décale ce qui peut l’être, recalcule ce qui dépendait de la cuisson et protège ce qui est déjà acheté. Le plan s’adapte à la semaine qui arrive vraiment.",
  "home.adapt.figure.label": "Trois imprévus, trois amplitudes",
  "home.adapt.figure.title": "Ce qui bouge quand la semaine dérape",
  "home.adapt.figure.desc": "Un repas sauté touche une assiette ; une cuisson sautée touche les repas qui en dépendent ; des courses repoussées peuvent déplacer le reste de la semaine.",
  "home.adapt.figure.meal": "Un repas sauté",
  "home.adapt.figure.session": "Une cuisson sautée",
  "home.adapt.figure.shopping": "Des courses repoussées",

  // ── LES MARQUES ──────────────────────────────────────────────────────────
  // ⚠️ LES QUATRE CLÉS `home.mark.*` ONT ÉTÉ RETIRÉES LE 2026-09-01 avec les
  // marques qu'elles décrivaient. C'étaient des `<title>` de SVG — la seule
  // chose qu'un lecteur d'écran entendait de ces figures —, et les figures
  // elles-mêmes ne portaient aucun texte visible. Voir `HomePage.tsx`.

  // ── LA CLÔTURE ───────────────────────────────────────────────────────────
  "home.close.title": "Commencez par la semaine qui vient.",
  // ⚠️ « FOYER » → « MAISON » EN VITRINE (2026-09-01). Le mot « foyer » est
  // celui du CODE et de la base (`households`, `keel_household_*`), où il est
  // juste et où il reste. En vitrine il est administratif — c'est le mot d'un
  // formulaire d'impôts, pas celui d'une table. Le bloc d'offre partagé dit
  // déjà « toute la maison »; ces phrases-ci le disaient autrement.
  // ⛔ NE PAS PROPAGER dans `/app/*` ni dans les noms de fonctions.
  "home.close.body":
    "Dites qui mange, ce qui ne se négocie pas et quand vous pouvez cuisiner. Sophia transforme ces réponses en repas, cuissons et courses — puis apprend avec la vraie vie.",
  "home.close.cta": "Composer votre première semaine",

  //
  // ── LE MOT QUI CHANGE D'UNE PAGE À L'AUTRE ───────────────────────────────
  // Ici ce sont des CLIENTS. « Élèves » appartient à `/coaches` seulement.
  // ⛔ « suivi personnalisé » nulle part. ⛔ Jamais « votre équipe » (B20).
  "pro.seo_title": "Sophia pour les pros — votre méthode, qui répond chaque jour",
  "pro.seo_description":
    "Vous enregistrez votre méthode une fois ; Sophia répond à vos clients avec elle, dans la conversation comme dans chaque semaine et chaque repas qu’elle rédige. 7 € par client et par mois.",

  "pro.hero.kicker": "Pour ceux qui vendent une méthode, pas des heures",
  "pro.hero.title": "Votre méthode au travail les jours où vous n’êtes pas là.",
  "pro.hero.lede":
    "Coachs, salles, communautés payantes : cinq choses qui doivent tenir quand vous n’êtes pas là.",
  "pro.hero.cta": "Démarrer l’essai de 14 jours",
  "pro.hero.note":
    "14 jours, jusqu’à 3 clients, puis ça s’arrête tout seul. Ensuite 7 € par client et par mois.",

  "pro.lines.kicker": "Le produit entier",
  // ⚠️ Voir la note anglaise: on ne sert pas au lecteur le nom de notre grille.
    // ⚠️ CINQ, ET C'ÉTAIT « SIX » JUSQU'AU 2026-08-19. Le compte n'est pas un
  // effet de style: la grille en dessous rend exactement autant de lignes. La
  // ligne 05 (B27, « chaque ligne cite la conviction qu'elle applique ») a été
  // retirée ce jour-là — le pourquoi est écrit une seule fois, dans `en.ts`,
  // et le `lede` du hero porte le même compte.
  "pro.lines.title": "Cinq fois où ça casse sans vous. Cinq réponses.",

  "pro.line.method.pain":
    "Ce qui doit être dit chaque jour ne peut pas dépendre de votre présence.",
  "pro.line.method.title": "Une méthode posée une fois, puis elle répond.",
  "pro.line.method.body":
    "La vôtre — ou la nôtre, si vous n’en avez pas. Le chemin existe ; le contenu de la méthode maison, lui, s’écrit encore.",

  "pro.line.daily.pain": "Vos clients ont des questions entre deux séances.",
  "pro.line.daily.title": "Le quotidien, tenu par votre méthode.",
  "pro.line.daily.body":
    "Elle entre à trois endroits : la conversation, le repas qu’ils cuisinent, et celui qu’ils cuisinent pour une table.",

  "pro.line.lock.pain": "Une IA qui parle en votre nom vous contredira.",
  "pro.line.lock.title": "Le double verrou.",
  "pro.line.lock.body":
    "Votre méthode entre dans la conversation, dans chaque semaine et dans chaque repas ; et ce qu’elle écrit dans la conversation est relu contre vos lignes rouges avant l’envoi — sans modèle dans cette boucle.",

  "pro.line.monday.pain":
    "Vous apprenez qu’un client a décroché une fois qu’il est parti.",
  "pro.line.monday.title": "Le lundi en une page.",
  "pro.line.monday.body":
    "Qui a répondu, qui s’est tu depuis deux jours, qui n’a rien dit depuis cinq. Calculée, jamais rédigée par un modèle — et vos clients seulement.",

  // ⚠️ `pro.line.cite.*` retirées le 2026-08-19 — voir le commentaire d'en.ts.
  // La garantie B27 reposait sur un CHECK que plus aucun écrivain ne satisfait.

  "pro.line.seat.pain": "Les plateformes facturent par palier.",
  "pro.line.seat.title": "Le siège est le seul poste.",
  "pro.line.seat.body":
    "7 € par client et par mois. Éteignez un siège, il cesse d’être facturé ce mois-là. Pas de forfait plateforme.",

  "pro.fig.alt":
    "Votre méthode et vos lignes rouges entrent ; ce qui franchit une ligne est retenu et remplacé avant l’envoi.",
  "pro.fig.method": "VOTRE MÉTHODE",
  "pro.fig.method_2": "écrite une fois",
  "pro.fig.lines": "VOS LIGNES ROUGES",
  "pro.fig.lines_2": "et ce que vous faites",
  "pro.fig.check": "relu",
  "pro.fig.sent": "ENVOYÉ",
  "pro.fig.held": "RETENU",
  "pro.fig.held_2": "dans vos mots",
  "pro.fig.caption":
    "Une consigne est suivie presque toujours. Une relecture n’en est pas une : elle tourne sur ce qui va partir.",

  "pro.close.title":
    "Nous n’avons pas de chiffre de rétention à vous vendre, et nous n’allons pas en inventer un.",
  "pro.close.body":
    "Rien ici ne mesure le churn contre un témoin : un chiffre écrit ici ne serait que de la décoration.",
  "pro.close.cta": "Démarrer l’essai de 14 jours",

  "pro.doors.title": "Trois métiers, trois pages.",
  "pro.door.coaches.title": "Vous vendez une formation",
  // ⚠️ Voir la note du bloc anglais: la carte citait le H1 de `/coaches`.
  "pro.door.coaches.body": "Ce qui ne se vendait qu’une fois, facturé chaque mois.",
  "pro.door.coaches.cta": "Voir pour une formation",
  "pro.door.gyms.title": "Vous tenez une salle indépendante",
  "pro.door.gyms.body":
    "Trois heures par semaine avec vous ; vingt et un repas sans vous.",
  "pro.door.gyms.cta": "Voir pour une salle",
  "pro.door.communities.title": "Vous tenez une communauté payante",
  "pro.door.communities.body":
    "Un fil n’a pas de destinataire. Voici la couche individuelle qui se pose dessous.",
  "pro.door.communities.cta": "Voir pour une communauté",

  // Les insécables sont posées AU CARACTÈRE (U+00A0), pas en échappement — même
  // forme que le reste du pack. Elles sont donc INVISIBLES à la relecture:
  // vérifiées au script, ligne par ligne, plutôt que supposées; une insécable
  // manquante ne se voit qu’au retour à la ligne, chez le visiteur.
  //
  // ── ⚠️ LES SIX `mealprep.dir.*` SONT LA TRADUCTION D'UNE CONSTANTE ─────────
  // L'anglais est `SERVING_DIRECTION` mot pour mot (`household_portions.ts`), et
  // `servingDirections.int.test.ts` l'épingle. Le français en est la traduction
  // FIDÈLE — il dit la même chose, et rien d'autre.
  //
  // Il n'est PAS ce que la page lit pour en déduire les axes: la grammaire du
  // module est un vocabulaire ANGLAIS fermé de dix mots, et une seconde table
  // française serait exactement la seconde définition que le module refuse. La
  // page LIT l'anglais, elle AFFICHE la langue du visiteur. Conséquence à
  // connaître avant d'éditer une ligne ci-dessous: une traduction qui s'écarte de
  // son anglais ne fera pas bouger les axes, elle fera juste mentir la fiche.
  // ── SEO ─────────────────────────────────────────────────────────────────
  "mealprep.seo_title": "Meal prep pour une personne — une semaine qui sert votre objectif",
  "mealprep.seo_description":
    "Sophia planifie vos repas, vos sessions de cuisine et vos courses en un ou deux passages. Les portions s’adaptent à votre corps et à votre objectif. 12,99 € par mois, toutes les fonctionnalités incluses.",

  "mealprep.cta": "Composer votre première semaine",

  // ── BANDE 1 · douleur 01 ────────────────────────────────────────────────
  "mealprep.plate.kicker": "Votre objectif, dans l’assiette",
  // ⚠️ « DÎNER » RÉÉCRIT EN « REPAS » LE 2026-09-01, et la porte du hall
  // (`home.door.solo.label`) avec lui: le produit compose les six moments
  // d’une journée, pas le seul soir. Le lede disait deux choses que personne
  // ne pouvait déplier — « rien ne vous dit ce que ça change ce soir » et
  // « c’est lui qui décide comment chacun est servi ». Ce que le moteur fait
  // vraiment est plus simple à dire, et c’est exactement ce que la
  // démonstration en dessous montre: `SERVING_DIRECTION`
  // (`household_portions.ts:260`) rend TROIS parts — protéine, féculent,
  // légumes — et l’objectif déplace chacune. Les mots des trois axes sont
  // ceux de la fiche (`mealprep.axis.*`), et l’objectif cité est celui du
  // premier bouton (`mealprep.goal.fat_loss`), à un écran de distance.
  "mealprep.plate.title": "Un objectif n’est pas un repas.",
  "mealprep.plate.lede":
    "« Perdre du gras » ne dit pas quoi mettre dans l’assiette. Sophia compose vos repas à partir de l’objectif que vous déclarez : dans chaque plat, la part de protéine, de féculent et de légumes suit ce que vous visez.",
  // ⚠️ `mealprep.plate.price_note` RETIRÉE LE 2026-09-01. Elle écrivait le
  // tarif à la main (« 11,99 € par mois. Seul, c'est le produit entier. »)
  // pendant que `/`, `/couples` et `/families` en écrivaient trois autres.
  // Le bloc partagé `offer` le dit maintenant pour les cinq surfaces.

  // ── La démonstration — le sélecteur d’objectif ──────────────────────────
  "mealprep.demo.legend": "Choisissez un objectif",
  // Les mots du produit: ce sont ceux de l’écran foyer (`household.goal.*`).
  // ⚠️ ALIGNÉS SUR `/couples` LE 2026-09-01. Cette page disait « Perte de masse
  // grasse » et « Prise de muscle » — le vocabulaire d'une fiche clinique —
  // quand `/couples` disait « Perdre du gras » et « Prendre du muscle » pour
  // les mêmes trois boutons du même moteur.
  "mealprep.goal.fat_loss": "Perdre du gras",
  "mealprep.goal.muscle_gain": "Prendre du muscle",
  "mealprep.goal.maintenance": "Maintien",

  // ⚠️ UN SEUL NOM POUR UNE SEULE CHOSE (2026-09-01). Le site en portait
  // TROIS pour le même objet, à un clic les uns des autres: « la consigne de
  // service » ici, « la direction de service » sur `/couples`, « une
  // instruction de service » dans sa description SEO. Aucun des trois ne dit
  // à un lecteur ce qu'il va recevoir. Celui-ci, si.
  "mealprep.demo.direction_label": "Comment on vous sert",
  // ⚠️ ALIGNÉE SUR `couples.dir.fat_loss` LE 2026-09-01. Les deux pages
  // montrent la MÊME consigne du moteur, et le pack français en disait deux
  // versions (« légumes en quantité » ici, « légumes généreux » là-bas).
  // `servingDirections.int.test.ts` ne lisait que le pack ANGLAIS: la
  // divergence a vécu dans l'angle mort de sa propre garde.
  "mealprep.dir.fat_loss":
    "légumes généreux, part de protéine entière, part de féculent plus petite",
  "mealprep.dir.muscle_gain":
    "part de protéine et de féculent plus grande, mêmes légumes",
  "mealprep.dir.maintenance": "part équilibrée de chaque composant",

  "mealprep.axis.protein": "Protéine",
  "mealprep.axis.starch": "Féculent",
  "mealprep.axis.vegetables": "Légumes",

  "mealprep.demand.smaller": "part réduite",
  "mealprep.demand.moderate": "part modérée",
  "mealprep.demand.balanced": "part équilibrée",
  "mealprep.demand.full": "part complète",
  "mealprep.demand.larger": "part plus grande",
  "mealprep.demand.none": "rien de demandé",

  // ── LES DEUX RÉGLAGES DE LA FOURCHETTE ──────────────────────────────────
  // ⚠️ POIDS ET ACTIVITÉ, ET RIEN D'AUTRE. Ce sont les deux seules entrées de
  // `maintenanceRange`. Ne pas ajouter la taille, l'âge ou le sexe: la formule
  // qui les utilise existe dans le dépôt (`estimatedMaintenanceKcal`) et le
  // test du moteur la REFUSE — elle multiplie un métabolisme de base par un
  // facteur d'activité deviné.
  "mealprep.demo.body_legend": "Votre poids",
  "mealprep.demo.weight_value": "{kg} kg",
  "mealprep.demo.activity_legend": "Vos journées",
  // Les quatre crans, dans les mots de l'inscription — un cran est une réponse
  // à une question, jamais une mesure. ⛔ Aucun chiffre dans ces libellés.
  "mealprep.activity.sedentary": "Assis toute la journée",
  "mealprep.activity.on_feet": "Debout, en mouvement",
  "mealprep.activity.trains_some": "Sport 2 à 3 fois par semaine",
  "mealprep.activity.trains_hard": "Sport 4 fois ou plus",

  // ── LA FOURCHETTE, ET LA PORTE QUI LA PRÉCÈDE ───────────────────────────
  // ⚠️ CE BLOC RENVERSE `docs/keel/LEGAL.md` §6.4, QUI DIT ENCORE « la copy
  // publique reste au point neutre — elle ne promet aucun chiffre ». Le
  // renversement est daté (2026-09-01), décidé par le propriétaire, et il
  // s'appuie sur la condition que §6.4 posait lui-même: « une règle écrite
  // disant qui ne le voit pas ». Cette règle existe désormais en code —
  // `_shared/keel/energy_gate.ts`, quatre portes, ordre contractuel.
  //
  // ⛔ CE QUI RESTE INTERDIT ICI, ET QUI NE SE NÉGOCIE PAS:
  //   · un POINT au lieu d'une fourchette;
  //   · un RESTE (« il vous reste 680 kcal ») — la phrase d'un tracker;
  //   · un VERDICT: au-dessus, en dessous, une couleur, une barre;
  //   · un comptage calorique PAR PHOTO (`LEGAL.md` §6.4, biais mesuré
  //     −26,6 % sur une photo nue, et du côté flatteur).
  "mealprep.energy.label": "La fourchette de votre journée",
  // La porte ② du moteur, rejouée sur la page. Le motif est le CHIFFRE, pas le
  // poids: on le dit, parce qu'une porte dont on ne comprend pas la raison se
  // lit comme une formalité et se clique sans lire.
  // ⚠️ `mealprep.energy.gate_why` ET `.gate_cta` ONT ÉTÉ RETIRÉES LE
  // 2026-09-01, sur décision du propriétaire: le chiffre ne se conditionne
  // plus à un geste d'âge sur la page. Ce qu'elles portaient — le fait que
  // le PRODUIT, lui, ferme ce chiffre pour un mineur et pour tout âge
  // inconnu — est désormais porté SEUL par `mealprep.energy.reserve`.
  // ⛔ Ne pas retirer la réserve pour alléger: sans elle, plus rien ne dit
  // que l'application ne montrera pas ce nombre à tout le monde.
  // ⚠️ DEUX CLÉS NOMMÉES PAR LEUR BASE, ET C'EST LA RÈGLE DE
  // `energyBasis.int.test.ts`: « la base est DANS la clé », donc il n'existe
  // aucun chemin où le nombre s'affiche et sa base non — ce sont le même
  // message. Une clé `range` neutre plus une phrase de base à côté aurait
  // marché aujourd'hui et cassé le jour où quelqu'un retire la phrase.
  // Les deux bases sont celles du moteur (`ENERGY_TARGET_BASES`):
  // `weight_range` et `weight_range_with_direction`.
  "mealprep.energy.range_weight": "{low} – {high} kcal pour votre poids et vos journées",
  "mealprep.energy.range_directed": "{low} – {high} kcal pour l’objectif que vous visez",
  "mealprep.energy.basis":
    "Une fourchette, jamais un chiffre unique. Elle couvre ce que ce corps dépense selon les jours — personne ne « rate » un intervalle.",
  // ── CE QUE L'OBJECTIF A FAIT À LA FOURCHETTE ────────────────────────────
  // ⚠️ AJOUTÉ LE 2026-09-01, ET C'ÉTAIT UN DÉFAUT DE COHÉRENCE: la page
  // faisait choisir un objectif et le nombre ne bougeait pas. Quelqu'un qui
  // veut perdre doit lire moins que quelqu'un qui veut prendre — sinon la
  // démonstration contredit la phrase qu'elle illustre.
  // ⛔ AUCUN VERDICT: on dit ce qui a bougé et pourquoi, jamais si c'est bien.
  // ⚠️ « 500 kcal » A ÉTÉ RETIRÉ LE 2026-09-01: `energyBasis.int.test.ts`
  // interdit qu'un nombre d'énergie vive dans une clé qui ne porte pas sa
  // base, et il a raison — c'est comme ça qu'un chiffre finit par voyager
  // seul. Le PLAFOND reste dit, en mots.
  "mealprep.energy.moved_down":
    "Cette fourchette est inférieure à celle du maintien parce que vous visez une perte de poids. La démonstration montre le rythme maximal accepté par Sophia ; un rythme plus lent reste possible.",
  "mealprep.energy.moved_up":
    "Cette fourchette est supérieure à celle du maintien parce que vous visez une prise de poids. La démonstration montre le maximum accepté par Sophia : 10 % de plus.",
  // `below_energy_floor` — un des trois motifs NOMMÉS par `directedRange`. Le
  // moteur REFUSE le décalage plutôt que de raboter, et c'est un argument.
  "mealprep.energy.floor_held":
    "Dans cet exemple, une fourchette plus basse passerait sous le minimum d’énergie autorisé. Sophia conserve donc la fourchette de maintien et l’indique clairement.",
  // `TargetGap` — aucune pesée exploitable. Ne devrait pas arriver sur cette
  // page (le curseur est borné), mais un `null` rendu nu serait un écran cassé.
  "mealprep.energy.no_range": "—",
  // ⚠️ LE PANNEAU « D'OÙ VIENT CE CHIFFRE » ET LA RÉSERVE ONT ÉTÉ RETIRÉS LE
  // 2026-09-01, sur décision du propriétaire (six clés: `assumptions_summary`,
  // `assumption_weight`, `assumption_activity`, `assumption_goal`,
  // `assumption_pace`, `reserve`).
  // ⛔ L'HYPOTHÈSE DE RYTHME A ÉTÉ SAUVÉE, et elle est repliée dans
  // `moved_down` / `moved_up`: un chiffre montré sans son hypothèse est un
  // chiffre faux, et celui-ci est l'écart le PLUS RAPIDE que la composition
  // accepte, pas un écart moyen.
  // ⚠️ CE QUI EST PERDU: la page ne dit plus que le produit garde ce chiffre
  // éteint par défaut et fermé tant que la date de naissance est inconnue.
  // Écart page/produit assumé — voir `LEGAL.md` §6.4 bis.
  // ⚠️ L'HYPOTHÈSE DE RYTHME, NOMMÉE. Dans le produit l'écart vient du rythme
  // que la personne choisit; une page de vente n'a pas de rythme à demander,
  // donc elle montre le plus grand écart que la composition accepte
  // d'exécuter — `MAX_DAILY_DEFICIT_KCAL` (500 kcal/j) et
  // `MAX_SURPLUS_FRACTION` (+10 %). Un chiffre montré sans son hypothèse est
  // un chiffre faux.
  "mealprep.energy.assumption_never":
    "Ni votre taille, ni votre âge, ni votre sexe n’entrent dans ce calcul. Une formule qui les mélange à un niveau d’activité deviné rend un chiffre faux avec l’aplomb d’un tableau.",
  // ⚠️ CETTE RÉSERVE ÉVITE LA DÉCEPTION À L'INSCRIPTION. 91 % de la base a un
  // âge inconnu, donc ne voit pas ce chiffre: le promettre sans le dire, c'est
  // vendre un écran que la personne n'aura pas.

  // ── L'ENCART SOMBRE · CE QUE L'OBJECTIF PILOTE ──────────────────────────
  // ⚠️ DEUX FAITS, ET LEUR FORMULATION EST CONTRAINTE.
  // 1. `CALORIE_REVERSAL` §7 (2026-08-18): « la cible contraint les GRAMMAGES,
  //    pas le choix des plats ». Écrire « le plan est construit selon vos
  //    calories » sans cette précision ferait entendre « une liste d'aliments
  //    de régime », ce qui est faux et ce que ce produit refuse d'être.
  // 2. Le repas non cuisiné entre dans le JOURNAL (`protocol_events`).
  // ⛔ INTERDIT, SANS NÉGOCIATION (`LEGAL.md` §6.4): laisser entendre qu'une
  //    photo rend des calories ou des macros. Biais mesuré −26,6 % sur photo
  //    nue, du côté flatteur, et `api/mealPhoto.ts` ne déclare aucun champ
  //    numérique — il rend une BANDE de portion.
  "mealprep.drive.kicker": "Quand vous voulez perdre ou prendre du poids",
  "mealprep.drive.title": "Ce sont les quantités qui bougent, pas la liste des plats.",
  // ⚠️ « les plats restent LES VÔTRES » était faux ici et a été corrigé le
  // 2026-09-01: sur cette page, c'est Sophia qui compose les plats. La moitié
  // qui compte reste — `CALORIE_REVERSAL` §7, « la cible contraint les
  // GRAMMAGES, pas le choix des plats »: aucun aliment n'est écarté ni imposé
  // pour atteindre un nombre.
  "mealprep.drive.grams":
    "Votre objectif modifie la quantité préparée — par exemple 560 g dans une boîte plutôt que 480 g — sans changer les plats composés pour vous. Aucun aliment n’est retiré ou imposé uniquement pour atteindre un chiffre.",
  // ⚠️⚠️ CETTE PHRASE DÉCRIT UN CHEMIN QUI N'EST PAS ENTIÈREMENT CÂBLÉ AU
  // 2026-09-01, ET C'EST UNE DÉCISION DU PROPRIÉTAIRE, PAS UN OUBLI.
  //
  // CE QUI EXISTE: `analyze-meal-photo-v1` calcule déjà un `energy_estimate`,
  // derrière la chaîne de gardes (`loadEnergyGate`), et `meal_analysis.ts`
  // FORCE sa base — `declared_quantities` (calcul, 2,3 % d'erreur mesurée) ou
  // `photo_estimate` (estimation, −26,6 % de biais mesuré). Une base non
  // méritée est dégradée et écrite dans `issues`.
  //
  // CE QUI MANQUE, ET QU'IL FAUT LIVRER AVANT LA MISE EN LIGNE:
  //   1. `api/mealPhoto.ts` ne déclare NI ne lit `energy_estimate` — son
  //      en-tête porte encore l'ancienne règle (« MUST NEVER SURFACE a
  //      calorie figure »), volontairement, depuis le renversement;
  //   2. aucun écran ne permet de CONFIRMER ni de CORRIGER une quantité,
  //      c'est-à-dire de passer de `photo_estimate` à `declared_quantities`.
  //
  // ⛔ CE QUE LA PHRASE NE DOIT JAMAIS DEVENIR: « Sophia compte vos calories
  // sur photo ». `LEGAL.md` §6.4 l'interdit sans négociation. Ce qui est
  // permis, et ce que cette phrase dit, c'est un chiffre QUI PORTE SA BASE et
  // que la personne peut corriger — la correction EST ce qui le rend fiable.
  // ⚠️⚠️ CETTE PHRASE DÉCRIT UN CHEMIN QUI N'EST PAS ENTIÈREMENT CÂBLÉ AU
  // 2026-09-01, ET C'EST UNE DÉCISION DU PROPRIÉTAIRE, PAS UN OUBLI.
  // CE QUI EXISTE: `analyze-meal-photo-v1` calcule déjà un `energy_estimate`,
  // derrière la chaîne de gardes, et `meal_analysis.ts` FORCE sa base.
  // CE QUI MANQUE, À LIVRER AVANT LA MISE EN LIGNE:
  //   1. `api/mealPhoto.ts` ne déclare NI ne lit `energy_estimate`;
  //   2. aucun écran ne permet de confirmer ni de corriger une quantité.
  // ⛔ CE QUE LA PHRASE NE DOIT JAMAIS DEVENIR: « Sophia compte vos calories
  // sur photo » (`LEGAL.md` §6.4, interdit sans négociation). Ce qui la garde
  // du bon côté, c'est « que vous confirmez ou corrigez »: le chiffre est
  // annoncé comme un ORDRE DE GRANDEUR corrigeable, jamais comme un comptage.
  // ⚠️ LE MARQUAGE DE LA BASE (`photo_estimate` / `declared_quantities`) EST
  // UNE OBLIGATION DE L'INTERFACE, pas de cette phrase — `LEGAL.md` §6.4 dit
  // « et l'interface le dit ». Ne pas en conclure qu'on peut s'en passer
  // dans l'app.
  "mealprep.drive.logged":
    "Le soir où vous n’avez pas cuisiné, vous pouvez photographier ou décrire votre repas pour l’ajouter au journal de la journée. Sophia en propose une estimation approximative, que vous confirmez ou corrigez ; une photo seule reste peu précise.",



  // ── BANDE 2 · douleur 02 ────────────────────────────────────────────────
  // ⚠️ CETTE BANDE EST LE HÉROS DEPUIS LE 2026-09-01. Un kicker de héros
  // NOMME l'objet de la page (comme « Les repas de la maison » sur le hall);
  // « La semaine » suffisait à une bande de milieu de page, pas à la première
  // ligne que quelqu'un lit. Il dit maintenant aussi le segment.
  "mealprep.week.kicker": "Les repas d’une semaine, pour une personne",
  "mealprep.week.title": "Vos repas de la semaine, planifiés en une fois.",
  // ⚠️ LE CHAPÔ DU HÉROS, AJOUTÉ LE 2026-09-01. Il doit nommer les TROIS
  // décisions qu'on reprend — quoi manger, quand cuisiner, quoi acheter —,
  // parce que c'est la charge mentale entière et pas seulement la cuisine.
  // Les courses sont explicitement dans le périmètre du bloc 1.
  // ⛔ Ne pas promettre un temps gagné: rien ne le mesure dans le dépôt.
  "mealprep.mental.lede":
    "Planifier les repas, choisir les jours de cuisine et prévoir les courses demande de reprendre les mêmes décisions chaque semaine. Sophia organise tout en une fois.",
  "mealprep.week.body":
    "La semaine arrive en sessions de cuisine, pas en plats isolés : vous cuisinez moins souvent, pour plusieurs jours d’un coup.",
  "mealprep.week.waves":
    "Les courses suivent le plan en un ou deux passages. Les produits frais sont achetés avant la session de cuisine qui les utilise.",

  // ── BANDE 2 · COMPOSÉ POUR VOUS ─────────────────────────────────────────
  // ⚠️ AJOUTÉE LE 2026-09-01. La page vendait l'organisation et le pilotage,
  // et jamais la deuxième raison d'acheter du segment: « est-ce que je mange
  // bien ? ». Elle manquait entièrement.
  //
  // ⛔ LA LIGNE À NE PAS FRANCHIR, ET ELLE EST ÉCRITE AILLEURS DANS LE DÉPÔT.
  // On promet la COMPOSITION, jamais le RÉSULTAT. Interdits, sans
  // négociation: « tous les apports », « à coup sûr », « équilibré garanti »,
  // tout taux de couverture, tout bilan nutritionnel rendu à quelqu'un.
  //   · `LEGAL.md` §6.1 — aucune promesse de résultat de santé;
  //   · `coverage` compte les aliments CONNUS et pas les PESÉS (69 % contre
  //     96 % mesurés): un taux affiché serait faux ET interdit.
  // Ce qui reste, et qui est vrai: chaque assiette est BÂTIE sur ce corps-là.
  "mealprep.composed.kicker": "Ce qu’il y a dans l’assiette",
  // ⚠️ LE MOT « ÉQUILIBRÉ » EST ARRIVÉ EN TITRE LE 2026-09-01, ET IL EST
  // BORNÉ PAR CE QUI SUIT. La bande parlait de TAILLE de part et jamais de
  // composition — or « est-ce que je mange bien » est la deuxième raison
  // d'achat du segment, et elle porte sur ce qu'il y a dans l'assiette.
  //
  // ⛔ CE QU'ON A LE DROIT DE DIRE, ET SEULEMENT ÇA. La lane FOYER garantit
  // structurellement UNE chose sur la composition: les trois composantes
  // sont là, et c'est leur PROPORTION qui suit l'objectif et le corps
  // (`SERVING_DIRECTION` / `readServingDemands`, `household_portions.ts`).
  // ⛔ CE QU'ON N'A PAS LE DROIT DE DIRE, ET J'AI VÉRIFIÉ AVANT DE L'ÉCRIRE:
  //   · pas de plancher protéique — `PROTEIN_FLOOR_G_PER_KG` (Morton 2018)
  //     vit dans `meal_envelope.ts` et n'est PAS lu par `household_portions
  //     .ts`. C'est la lane INDIVIDUELLE. Le vendre ici serait vendre le
  //     produit d'à côté;
  //   · pas d'ancre protéique par repas — c'est une POSITION DE DOCTRINE
  //     qu'un coach peut prendre (`composition_forks.ts`), pas une règle;
  //   · aucun taux de couverture (`coverage` compte les connus, pas les
  //     pesés), aucune garantie d'apports, aucun bilan.
  "mealprep.composed.title": "Un repas complet, dans une quantité adaptée à vous.",
  // L'ÉQUILIBRE, ET IL EST DIT PAR SON MÉCANISME: la PRÉSENCE des trois
  // composantes ne se négocie pas, seule leur proportion bouge. C'est ce que
  // la démonstration de la bande suivante montre en direct.
  "mealprep.composed.body":
    "Chaque assiette garde ses trois composantes : une protéine, un féculent et des légumes. Sophia construit l’équilibre du repas dès la composition de la semaine.",
  // La seconde moitié de l'équilibre: la TAILLE, qui est l'autre chose que le
  // moteur compose vraiment (le corps et l'activité entrent dans l'enveloppe
  // de chaque bouche).
  "mealprep.composed.body_size":
    "La quantité tient compte de votre corps et de votre niveau d’activité. Une personne assise huit heures et une personne qui s’entraîne quatre fois par semaine ne reçoivent pas la même portion du même plat.",
  // La deuxième moitié de l'argument, et c'est celle qui vend: le travail est
  // fait AU MOMENT DE COMPOSER, donc il n'y a rien à surveiller après.
  "mealprep.composed.body_2":
    "Tout est prévu au moment de composer la semaine. À table, vous suivez simplement la portion indiquée : rien à peser, rien à cocher, rien à recalculer.",
  // ⚠️ « SI ÇA SUFFIT » → « SI VOUS MANGEZ ÉQUILIBRÉ », 2026-09-02, sur
  // demande du propriétaire, et c'est la SECONDE fois qu'il corrige cette
  // famille de phrases dans le même sens: la clôture doit nommer ce dont on
  // décharge le lecteur — l'équilibre — et pas une quantité (« suffire »),
  // qui ne dit rien à qui n'a jamais compté.
  // ✅ LEGAL §6.1: ce n'est aucun des quatre interdits — ni promesse de
  // résultat, ni before/after, ni revendication de maladie, ni comparaison à
  // un professionnel. On décrit le TRAVAIL DE COMPOSITION, pas une issue.
  "mealprep.composed.note":
    "L’équilibre et la quantité sont décidés avant que vous cuisiniez. Vous ouvrez le plan et vous suivez ce qui est prévu.",

  "mealprep.fig.session.title": "Une session de cuisine, plusieurs repas prêts",
  "mealprep.fig.session.desc":
    "Une casserole vue de dessus, reliée par un peigne de traits à des contenants identiques : le même dessin, trois fois.",
  "mealprep.fig.session.label": "UNE SESSION DE CUISINE",
  "mealprep.fig.session.pot": "une session",
  "mealprep.fig.session.covers": "CE QU’ELLE COUVRE",

  "mealprep.fig.waves.title": "Les courses réparties dans la semaine",
  "mealprep.fig.waves.desc":
    "Deux paniers identiques au-dessus des jours qu’ils couvrent. Le premier tient sur trois jours ; le second continue, ouvert.",
  "mealprep.fig.waves.label": "LES COURSES DANS LA SEMAINE",
  "mealprep.fig.waves.first": "PREMIER PASSAGE",
  "mealprep.fig.waves.next": "SECOND PASSAGE",
  "mealprep.fig.waves.fresh": "TROIS JOURS",
  "mealprep.fig.waves.week": "LA SEMAINE",

  // ── BANDE 3 · douleur 03 ────────────────────────────────────────────────
  "mealprep.moves.kicker": "Quand un imprévu arrive",
  // ⚠️ LE TITRE COUVRE LES TROIS ACCIDENTS DEPUIS LE 2026-09-01. Il disait
  // « Un soir manqué ne refait pas la semaine » — vrai du plus petit des
  // trois, et muet sur les deux qui font vraiment tomber un plan.
  "mealprep.moves.title": "Sophia recale le reste de la semaine.",
  // ⚠️ LA RÉPARATION EST ICI, PAS DANS LA FIGURE — et elle n'est pas la même
  // pour les trois, ce qui est précisément pourquoi elle est du texte.
  // fact: `FF-057` §B — l'espace de réalignement est PRÉ-CALCULÉ depuis le
  // plan réel, borné à quatre actions, et « ne rien faire » en est une.
  // ⚠️ « TROIS JOURS » EST LE CHIFFRE DU MOTEUR, PAS UNE FORMULE: c'est
  // `MAX_FRIDGE_DAYS = 3` (`meal_generation.ts`, appliqué en
  // `grocery_waves.ts`). Il a remplacé « si le frigo tient jusque-là » le
  // 2026-09-01 — une métaphore que le lecteur ne peut pas vérifier, alors que
  // la règle réelle est simple et se retient.
  // fact: `FF-057` §B — l'espace de réalignement est PRÉ-CALCULÉ depuis le
  // plan réel, borné à quatre actions, et « ne rien faire » en est une.
  // ⚠️ DEUX PARAGRAPHES DE LONGUEUR VOISINE, ET C'EST UNE CONTRAINTE DE MISE
  // EN PAGE: ils sont rendus côte à côte. Un déséquilibre laisse une colonne
  // courte à côté d'une longue, ce qui se lit comme un défaut plutôt que
  // comme un partage. Le pli est au bon endroit: à gauche les deux accidents
  // qui touchent un repas ou une cuisson, à droite celui qui menace la
  // semaine entière.
  // ⚠️ « TROIS JOURS » EST LE CHIFFRE DU MOTEUR: `MAX_FRIDGE_DAYS = 3`
  // (`meal_generation.ts`, appliqué en `grocery_waves.ts`).
  // fact: `FF-057` §B — l'espace de réalignement est PRÉ-CALCULÉ depuis le
  // plan réel, et borné à quatre actions.
  // ⚠️ DEUX PARAGRAPHES DE LONGUEUR VOISINE, ET C'EST UNE CONTRAINTE DE MISE
  // EN PAGE: ils sont rendus CÔTE À CÔTE. Un déséquilibre laisse une colonne
  // courte à côté d'une longue, ce qui se lit comme un défaut et pas comme un
  // partage. Le pli est au bon endroit: à gauche les deux accidents qui
  // touchent un repas ou une cuisson, à droite celui qui menace la semaine
  // entière.
  // ⚠️ « 3 JOURS » EST LE CHIFFRE DU MOTEUR: `MAX_FRIDGE_DAYS = 3`
  // (`meal_generation.ts`, appliqué en `grocery_waves.ts`).
  // fact: `FF-057` §B — l'espace de réalignement est PRÉ-CALCULÉ depuis le
  // plan réel, et borné à quatre actions.
  // ⚠️ DEUX PARAGRAPHES DE LONGUEUR VOISINE, ET C'EST UNE CONTRAINTE DE MISE
  // EN PAGE: ils sont rendus CÔTE À CÔTE. Un déséquilibre laisse une colonne
  // courte à côté d'une longue, ce qui se lit comme un défaut et pas comme un
  // partage. Le pli est au bon endroit: à gauche les deux accidents qui
  // touchent un repas ou une cuisson, à droite celui qui menace la semaine.
  //
  // ⚠️ « SANS-CUISSON POUR LE SOIR MÊME » ÉTAIT FAUX, CORRIGÉ LE 2026-09-01.
  // Ce que fait vraiment un tap « la cuisson n'a pas eu lieu », dans
  // `_shared/chat/accident_tap.ts`: (1) `cascadeSkippedSession` — les repas
  // qu'elle devait produire tombent, DÉRIVÉS à la lecture, et un repas déjà
  // coché SURVIT; puis (2) `computeSessionShift` + `buildShiftProposal`,
  // c'est-à-dire « l'action n°5: décaler la session ET ce qui en dépend »,
  // avec ses boutons. `no_cook` n'est qu'UNE option de
  // `buildRealignmentSpace`, et `FF-057` §B la borne à « quand la session est
  // tombée ET QUE RIEN N'EST PRÊT ». En faire la réponse principale décrivait
  // le cas de bord et taisait le mécanisme.
  //
  // ⚠️ « 3 JOURS » EST LE CHIFFRE DU MOTEUR: `MAX_FRIDGE_DAYS = 3`.
  "mealprep.moves.body":
    "Vous dites ce qui a changé. Si vous sautez un repas, Sophia peut le déplacer tant qu’il ne dépasse pas 3 jours au réfrigérateur. Si une session de cuisine n’a pas lieu, elle propose de la déplacer avec les repas qui en dépendaient.",
  "mealprep.moves.body_2":
    "Si les courses ne sont pas faites, Sophia recale aussi la session de cuisine prévue et les repas associés. Le plan vous montre ce qui doit bouger avant de vous retrouver sans repas prévu.",
  // ⚠️ `mealprep.moves.note` A ÉTÉ RETIRÉE LE 2026-09-01, sur décision du
  // propriétaire. Elle disait « aucun plat de remplacement n'est choisi à
  // votre place […] “Ne rien changer” est une réponse possible ».
  // ⚠️ CE QU'ELLE PORTAIT, POUR QUE PERSONNE NE LE REDÉCOUVRE: deux faits
  // vrais du moteur — `accident.ts` §5.1 (aucune fonction de ce chemin ne
  // CHOISIT un plat) et R4 (`nothing_to_change` est une FIN NORMALE, pas un
  // échec). Les deux restent vrais; la page ne les dit simplement plus.
  // ⚠️ ET UNE RÉSERVE QUI, ELLE, CONTRAINT ENCORE `moves.body`: `FF-057` est
  // 🟠 EN COURS — livrée par la CONVERSATION, à moitié par l'écran. On écrit
  // donc « vous le dites », jamais « un bouton sur l'écran ».

  "mealprep.fig.moves.title": "Les trois accidents qu’une semaine encaisse",
  // ⚠️ RÉÉCRITE AVEC LA FIGURE LE 2026-09-01. L'ancienne disait « un plat
  // quitte son soir ; la session part avec lui » — ce que le dessin, lui, ne
  // montrait pas: les deux premières cartes étaient identiques au trait près.
  // Une description alternative qui décrit mieux que le dessin est une
  // description qui masque le défaut du dessin.
  // ⚠️ RÉÉCRITE AVEC LA FIGURE. Elle doit décrire ce que le dessin MONTRE —
  // l'amplitude croissante — et pas ce qu'on voudrait qu'il dise.
  "mealprep.fig.moves.desc":
    "Trois cartes, un accident par carte, et ce qui tombe grandit de gauche à droite. Sur la première, une seule assiette en pointillé. Sur la deuxième, une casserole en pointillé et les trois assiettes qu’elle nourrit. Sur la troisième, un panier en pointillé au-dessus de la casserole et de ses trois assiettes.",
  "mealprep.fig.moves.label": "TROIS ACCIDENTS",
  // ⚠️ LES TROIS LIBELLÉS NOMMENT L'ACCIDENT, PLUS LE GESTE (2026-09-01). Ils
  // disaient « DÉCALER UN PLAT » et « DÉCALER LA SESSION » — la réparation,
  // c'est-à-dire la réponse avant la question. La figure montre maintenant ce
  // qui TOMBE, et le texte à côté dit ce que le plan en fait.
  "mealprep.fig.moves.dish": "UN REPAS SAUTÉ",
  "mealprep.fig.moves.session": "UNE CUISSON SAUTÉE",
  // ⚠️ `mealprep.fig.moves.tonight` (« PAS CE SOIR ») a été REMPLACÉE le
  // 2026-09-01. Ce n'était pas un accident, c'était une réponse — et elle
  // occupait la place du troisième accident réel, celui que `FF-057` appelle
  // « la seule entrée qui menace le plan ENTIER ».
  "mealprep.fig.moves.shopping": "DES COURSES NON FAITES",

  // ── BANDE 4 · le prix et la clôture ─────────────────────────────────────
  "mealprep.start.kicker": "Pour commencer",
  // ⚠️ NE PORTE PLUS LE CHIFFRE (2026-09-01): il vit dans `PriceCard`, qui le
  // prend dans `PRICES.household`. Un titre qui le retapait devenait faux à
  // chaque bascule de tarif — et il en a eu deux en deux jours.
  // ⚠️ ET SANS PRONOM: « Seul, tu as tout » tutoyait sous un site qui vouvoie.
  "mealprep.start.title": "Tout est inclus dès la première personne.",
  "mealprep.start.body":
    "Rien n’est réservé aux plus grandes tablées : les repas, les sessions de cuisine, les courses et la conversation sont là dès la première personne. Et si quelqu’un vous rejoint un jour, il s’ajoute — vous ne changez pas de produit.",
  "mealprep.start.period": "par mois",
  // ⚠️ « Une maison. À une personne, elle est déjà entière. » a été retiré le
  // 2026-09-01: le mot « maison » vient du bloc d'offre partagé, où il vaut
  // pour un foyer de huit. Sur LA page de quelqu'un qui vit seul, il oblige à
  // résoudre une devinette pour comprendre une ligne de prix.
  "mealprep.start.price_label": "Pour une personne, avec toutes les fonctionnalités.",
  // ⚠️ LA FICHE « CE QU'ON TE DEMANDE » ET SES CINQ CLÉS ONT ÉTÉ RETIRÉES LE
  // 2026-09-01 (`asks_label`, `ask_name`, `ask_birthdate`, `ask_goal`,
  // `ask_allergies`). Elle annonçait QUATRE champs; le parcours réel en pose
  // treize avant le premier plan en solo, vingt-deux à deux, trente-huit pour
  // une famille de quatre — les questions `weight: "wrong"` de
  // `api/onboarding.ts`. Décision du propriétaire: on ne chiffre pas l'effort
  // d'entrée sur une page de vente. On ne le corrige donc pas, on ne le dit
  // plus. Voir le commentaire de `MealPrepPage.tsx` à l'endroit du bloc.
  "mealprep.start.note": "Ensuite Sophia compose la première semaine, en sessions.",

  //
  // ── LES SIX `couples.dir.*` SONT UNE TRADUCTION, JAMAIS L'ORIGINAL ────────
  // L'original anglais est une constante du moteur (`SERVING_DIRECTION`), et
  // c'est LUI que `CouplesPage.tsx` donne à lire à son lecteur d'axes — la
  // grammaire du module est un vocabulaire fermé de dix mots ANGLAIS. Ces six
  // lignes-ci ne sont donc lues par personne d'autre que l'œil du visiteur:
  // traduire fidèlement suffit, et il n'y a aucun mot-clé à préserver.
  // ── SEO ──────────────────────────────────────────────────────────────────
  // ⚠️ SUIT LE NOUVEAU HÉROS (2026-09-01). Il disait « Deux objectifs, une
  // seule cuisson » — le titre de la page quand la fonctionnalité ouvrait.
  // Depuis, la page ouvre sur la charge mentale à deux.
  "couples.seo_title": "Les repas de la semaine à deux, décidés une fois",
  // ⚠️ LE TARIF EN TOUTES LETTRES: une balise <meta> n'a pas de composant
  // pour l'interpoler. `format.int.test.ts` exige qu'elle dise le tarif
  // courant de `PRICES.household`.
  "couples.seo_description":
    "Ce qu’on mange, quand on cuisine, ce qu’il faut acheter — décidé une fois pour la semaine, à deux. Deux objectifs et deux régimes cohabitent : un seul plat quand c’est possible, deux dans la même cuisson quand ça ne l’est pas. 12,99 € par mois pour toute la maison.",

  // ── BANDE 1 — DOULEUR 01: deux objectifs = deux casseroles = abandon ──────
  // ⚠️ LE HÉROS A CHANGÉ D'OBJET LE 2026-09-01. Il portait « Deux objectifs.
  // Une seule cuisson. » — la fonctionnalité la plus spécifique de la page,
  // en première ligne. Elle est descendue en bande 3, sur l'ordre d'achat du
  // segment: on achète d'abord de ne plus avoir à décider.
  // ⚠️ ET L'ANGLE N'EST PAS CELUI DE `/meal-prep`: à deux, la charge ne pèse
  // pas seulement, elle se NÉGOCIE. « Qu'est-ce qu'on mange » est une
  // question posée à quelqu'un, tous les soirs.
  "couples.hero.kicker": "Les repas d’une semaine, à deux",
  // ⚠️ RECOPIÉ MOT POUR MOT SUR `home.door.pair.label`.
  "couples.hero.title": "Le plus dur, c’est de se mettre d’accord.",
  "couples.hero.lede":
    "« Qu’est-ce qu’on mange ? » revient chaque soir, et la personne qui répond finit souvent par gérer aussi les courses et la cuisine. Sophia tranche une fois pour la semaine : les repas, les jours de cuisine et la liste de courses.",
  "couples.hero.cta": "Composer votre première semaine",
  // ⚠️ `couples.hero.price` RETIRÉE LE 2026-09-01. Elle vendait le second
  // accès 2 € pendant que `/families` le vendait 1,99 € sous le nom
  // « accompagnement » — deux noms, deux montants, un seul objet, à un clic
  // l'un de l'autre. `ui/OfferLines.tsx` rend maintenant les mêmes quatre
  // lignes ici et sur les quatre autres surfaces du foyer.
  // ⚠️ Voir la note du bloc anglais: la réserve vaut pour les quatre pages.

  // ── LA DÉMONSTRATION — deux objectifs, une casserole ─────────────────────
  // ⚠️ LE CHAPEAU ANNONCE LA QUESTION, PAS UNE RÉPONSE. Il disait « Une
  // cuisson, deux parts » au-dessus d'une démo qui peut répondre « Deux
  // plats »: qui ne lisait que le chapeau en concluait un seul plat.
  // La cuisson, elle, EST invariante ici — `couplesLadderDemo.int.test.ts`
  // prouve que cette démo ne rend jamais `separate_sessions`.
  "couples.demo.eyebrow": "Une cuisson. Un plat, ou deux.",
  "couples.demo.hint": "Choisissez un objectif pour chacun.",

  // ── LE RÉGIME, ET CE QUE LA CASSEROLE EN FAIT ───────────────────────────
  // ⚠️ QUATRE CHOIX POUR TROIS JETONS. `DIETARY_REGIMES` n'a que
  // `vegetarian`, `vegan`, `pescatarian`: l'omnivore est l'ABSENCE de régime,
  // et `strictestRegimeAt` l'ignore par construction. Le libellé existe pour
  // que le lecteur ait un bouton à cocher, pas parce que le jeton existe.
  // fact: `20260814110000_dietary_regime_per_mouth.sql` — le régime est PAR
  // BOUCHE, donc il vaut aussi pour le conjoint sans compte.
  "couples.demo.diet_legend": "Ce qu’il ou elle mange",
  "couples.diet.omnivore": "De tout",
  "couples.diet.vegetarian": "Végétarien",
  "couples.diet.vegan": "Végane",
  "couples.diet.pescatarian": "Pescatarien",

  // ── LA SORTIE DE LA DÉMONSTRATION ───────────────────────────────────────
  // ⚠️ ELLE EST CALCULÉE PAR `mergeLadder`, jamais choisie par la page. Deux
  // barreaux sur trois sont atteignables ici: `separate_sessions` demande
  // qu'AUCUN jour de cuisine ne soit partagé, une question que cette page ne
  // pose pas — on le dit dans `outcome_rule` plutôt que de le faire
  // apparaître par hasard.
  "couples.demo.outcome_label": "Ce qui sort de la casserole",
  "couples.demo.outcome_one_dish": "Un seul plat, servi différemment.",
  "couples.demo.outcome_one_session": "Deux plats, une seule cuisson.",
  "couples.demo.outcome_why_one_dish":
    "Le même plat répond aux deux besoins ; Sophia indique simplement une portion différente pour chacun.",
  "couples.demo.outcome_why_goals":
    "Le même plat ne peut pas fournir les deux portions prévues. Sophia ajoute un second plat, préparé pendant la même session de cuisine.",
  // R4 + R5 de `household_diet.ts`, dits en français de tous les jours.
  "couples.demo.outcome_why_diet":
    "Le plat commun respecte le régime le plus strict — {regime}. Si ce plat ne permet plus de composer l’une des deux portions, Sophia ajoute un second plat.",
  // ⚠️ LA RÈGLE EN UNE PHRASE — le critère D6, appliqué littéralement par
  // `servingConflicts`. Elle explique les deux barreaux d'un coup, et elle
  // nomme le troisième sans le faire apparaître.
  "couples.demo.outcome_rule":
    "Sophia garde un plat commun quand il convient aux deux. Sinon, elle prépare deux plats dans la même session. Deux sessions séparées ne sont nécessaires que si vous n’avez aucun jour de cuisine en commun.",

  // ── BANDE 3 · DEUX OBJECTIFS, DEUX RÉGIMES ──────────────────────────────
  "couples.together.kicker": "Deux personnes, deux façons de manger",
  "couples.together.title": "Vos objectifs et vos contraintes peuvent tenir dans le même plan.",
  "couples.together.lede":
    "L’un veut prendre du muscle, l’autre perdre du gras. L’un mange végétarien, l’autre de tout. Sophia cherche d’abord un plat commun, puis ajoute un second plat seulement si les deux besoins ne peuvent pas tenir ensemble.",
  // ⚠️ LES GOÛTS, EN PROSE ET SANS RÉGLAGE. Le parcours ne collecte QUE le
  // régime et les allergies. « N’aime pas le poisson » vit dans la mémoire
  // apprise en conversation, pas dans un formulaire — et c’est ce que dit
  // cette phrase, sans promettre un bouton.
  "couples.together.tastes":
    "Les préférences s’apprennent dans la conversation. Dites une fois « je n’aime pas le poisson » : Sophia l’écarte des semaines suivantes.",

  // ── LE BLOC SOMBRE · LE SEUL DE LA PAGE ─────────────────────────────────
  // fact: `household_diet.ts` R4 — « un omnivore peut manger un plat
  // végétarien; l’inverse est faux », l’exacte symétrie de l’union des
  // allergies et du critère D6. R5 — celui dont la direction de service ne
  // sort plus de la casserole descendue au plus strict reçoit SON plat, et
  // seulement si le temps de cuisine le permet.
  "couples.give_up.kicker": "Quand les contraintes diffèrent",
  "couples.give_up.title": "Le plat commun respecte la contrainte la plus stricte.",
  "couples.give_up.body":
    "Si l’un de vous est végétarien, le plat partagé l’est aussi. La personne qui mange de tout peut manger ce plat ; la personne végétarienne ne peut pas manger un plat contenant de la viande. La même logique s’applique aux allergies.",
  "couples.give_up.body_2":
    "Si ce plat commun ne permet plus de composer la portion prévue pour l’autre personne, Sophia ajoute un second plat pendant la même session de cuisine. Elle ne sépare les plats que lorsque c’est nécessaire.",

  // ── BANDE 4 · LES TROIS ACCIDENTS ───────────────────────────────────────
  // ⚠️ MÊME FIGURE QUE `/meal-prep` (`ui/AccidentsFigure.tsx`), clés propres à
  // cette page: à deux, un accident ne tombe pas sur la même personne selon
  // ce qui a sauté, et c’est là que la charge se renégocie.
  // ⚠️ « 3 JOURS » EST LE CHIFFRE DU MOTEUR: `MAX_FRIDGE_DAYS = 3`.
  // ⚠️ Deux paragraphes de longueur voisine — ils sont rendus côte à côte.
  "couples.moves.kicker": "Quand un imprévu arrive",
  "couples.moves.title": "Sophia recale le plan pour vous deux.",
  "couples.moves.body":
    "L’un de vous dit ce qui a changé. Si vous sautez un repas, Sophia peut le déplacer tant qu’il ne dépasse pas 3 jours au réfrigérateur. Si une session de cuisine n’a pas lieu, elle propose de la déplacer avec les repas qui en dépendaient.",
  "couples.moves.body_2":
    "Si les courses ne sont pas faites, Sophia recale aussi la session de cuisine prévue et les repas associés. Vous voyez immédiatement ce qui doit bouger, sans devoir reconstruire le planning à deux.",
  "couples.fig.moves.label": "TROIS ACCIDENTS",
  "couples.fig.moves.title": "Les trois accidents qu’une semaine encaisse",
  "couples.fig.moves.desc":
    "Trois cartes, un accident par carte, et ce qui tombe grandit de gauche à droite. Sur la première, une seule assiette en pointillé. Sur la deuxième, une casserole en pointillé et les trois assiettes qu’elle nourrit. Sur la troisième, un panier en pointillé au-dessus de la casserole et de ses trois assiettes.",
  "couples.fig.moves.dish": "UN REPAS SAUTÉ",
  "couples.fig.moves.session": "UNE CUISSON SAUTÉE",
  "couples.fig.moves.shopping": "DES COURSES NON FAITES",
  "couples.demo.person_a": "L’un de vous",
  "couples.demo.person_b": "L’autre",

  // Les six objectifs, par leur nom d'écran.
  "couples.goal.fat_loss": "Perdre du gras",
  "couples.goal.muscle_gain": "Prendre du muscle",
  "couples.goal.maintenance": "Maintien",

  // La traduction fidèle des six consignes de service.
  "couples.dir.fat_loss":
    "légumes généreux, part de protéine entière, part de féculent plus petite",
  "couples.dir.muscle_gain":
    "part de protéine et de féculent plus grande, mêmes légumes",
  "couples.dir.maintenance": "part équilibrée de chaque composant",

  // Les trois axes qu'une direction sait nommer.
  // ⚠️ LES DIX CLÉS `couples.axis.*` ET `couples.demand.*` ONT ÉTÉ RETIRÉES
  // LE 2026-09-01 avec le tableau des axes de la démonstration. Ce tableau
  // REDISAIT, décomposée, la phrase juste au-dessus — `readServingDemands`
  // la PARSE pour le construire. Sa justification d'origine (« c'est ligne
  // par ligne qu'on les compare ») valait quand la démonstration n'avait pas
  // de SORTIE; elle en a une depuis, qui répond au lieu de faire comparer.
  // ⚠️ `couples.dir.*` RESTE, et reste épinglée sur le moteur par
  // `servingDirections.int.test.ts`: c'est la phrase, pas le tableau.

  // L'échelle, du moins au plus. Le nom sous-entendu est « la part », d'où
  // l'accord au féminin.
  // ⚠️ LE QUALIFICATIF PORTE SON PROPRE NOM, ET C’EST UNE RÈGLE DE LANGUE,
  // PAS UN CHOIX DE STYLE. « plus petite » servait trois axes de genres
  // différents: l’écran rendait « Féculent — plus grande » et « Légumes —
  // équilibrée », deux fautes d’accord dans la seule figure qui porte
  // l’argument de la page. Adosser le qualificatif à « part » (féminin) le
  // rend indépendant de l’axe. C’est la forme que `/meal-prep` avait déjà:
  // les deux démonstrations disent maintenant la même chose de la même façon.

  // ── BANDE 2 — DOULEUR 02: « il mange deux fois plus que moi » ────────────
  // ── BANDE 2 · EST-CE QU'ON MANGE BIEN ? ─────────────────────────────────
  // ⚠️ CETTE BANDE NE PARLAIT QUE DE LA TAILLE D'UNE PART. C'est vrai, et
  // c'est la SECONDE moitié: la première est que les trois composantes sont
  // toujours là et que l'objectif ne change que leur PROPORTION.
  // ⛔ Pas de plancher protéique (lane individuelle), pas d'ancre par repas
  // (position de doctrine), aucun taux de couverture, aucun bilan.
  "couples.bodies.kicker": "Les portions",
  "couples.bodies.title": "Le même repas, deux quantités adaptées.",
  "couples.bodies.lede":
    "Chaque repas garde ses trois composantes : une protéine, un féculent et des légumes. La différence entre vos assiettes se joue dans la quantité, pas dans l’équilibre du repas.",
  "couples.bodies.size":
    "La portion de chacun est calculée à partir de sa taille, de son poids, de son âge et de son sexe. Vous pouvez manger le même plat sans devoir vous servir la même quantité.",
  // ⚠️ MÊME CLÔTURE QUE `mealprep.composed.note` ET `families.balanced.body_2`,
  // donc elle nomme l'ÉQUILIBRE elle aussi. Le propriétaire n'a nommé que le
  // solo et la famille; laisser « si ça suffit » ici aurait fait dire trois
  // choses différentes à la même phrase sur trois pages voisines.
  "couples.bodies.settled":
    "Les deux portions sont prévues avant la cuisson : vous n’avez rien à recalculer au moment de servir.",
  "couples.bodies.in_label": "Pour calculer la portion",
  "couples.bodies.in_1": "Taille",
  "couples.bodies.in_2": "Poids",
  "couples.bodies.in_3": "Âge",
  "couples.bodies.in_4": "Sexe",
  "couples.bodies.out_label": "Dans le plan",
  // ⚠️ Disait « une instruction de service » — le mot du moteur, pas celui
  // du lecteur. C'est la SORTIE d'un schéma: elle doit nommer ce qu'on
  // obtient, pas l'objet interne qui le porte.
  "couples.bodies.out": "la portion de chacun, indiquée en mots",

  // ── BANDE 3 — DOULEUR 03: un seul des deux planifie ─────────────────────
  "couples.other.kicker": "Le second profil",
  // ⚠️ Voir la note du bloc anglais: le titre vendait la délégation.
  "couples.other.title": "Chacun peut accéder au plan et gérer son objectif.",
  // ⚠️ NE VEND PLUS « la charge se partage ». C'était faux dans les deux
  // sens: la charge est prise par Sophia, pas répartie entre les deux — et
  // l'acheteur du second profil n'achète pas un partage de corvée, il achète
  // que SON objectif compte.
  // ⛔ ET SURTOUT PAS « suivi »: le profil réclamé donne DEUX choses et deux
  // seules — lire le plan, et poser son objectif. Pas de suivi, pas de
  // courbe, les mesures corporelles sont hors périmètre (C16 / S6).
  // ⚠️ Le montant est sorti de la phrase le 2026-09-01 (elle disait « 2 € par
  // mois » en dur). Le mot « profil réclamé » part au lot du vocabulaire.
  // ⚠️ « le profil réclamé » remplacé par « son propre accès » (2026-09-01).
  "couples.other.lede":
    "Même sans compte, l’autre personne est prise en compte dans les repas et reçoit sa portion. Avec son propre accès, elle peut consulter le plan et suivre elle-même son objectif. {amount} par mois.",

  // ── LA SEMAINE, DESCENDUE ICI LE 2026-09-01 ─────────────────────────────
  // ⚠️ CETTE PAGE NE DISAIT NULLE PART CE QU'ON REÇOIT. Elle vendait une
  // FONCTIONNALITÉ — une cuisson, deux parts — et jamais le produit: ni les
  // sessions de cuisine, ni les courses, ni le plan de la semaine. Mesuré le
  // 2026-09-01: 364 mots rendus contre 700 sur `/families`, et un couple qui
  // lisait cette page de bout en bout ignorait qu'il achetait une semaine
  // composée et une liste de courses. Les deux champs ci-dessous sont la
  // version courte de ce que `/meal-prep` et `/families` détaillent — mêmes
  // faits, écrits pour deux.
  "couples.week.kicker": "Ce qui arrive chaque semaine",
  "couples.week.title": "Ce n’est pas qu’une consigne de service.",
  // ⚠️ LES REPAS MANQUAIENT À LA FICHE, ET C'ÉTAIT UN TROU DE FOND, PAS DE
  // MISE EN PAGE (2026-09-02). `couples.hero.lede` promet TROIS choses — « les
  // repas, les jours de cuisine, la liste » — et la fiche du héros n'en
  // montrait que deux. Mesuré: 303 px de fiche contre 635 px de colonne de
  // texte, soit 332 px de vide à droite du héros. La pièce manquante était la
  // PREMIÈRE de la liste.
  // fact: la fenêtre de composition va de 1 à 7 jours (`MAX_WINDOW_DAYS`), et
  // c'est l'élève — ici le foyer — qui compose. ⛔ Ne pas écrire que Sophia
  // « envoie » ou « prépare » un plan: personne n'attend.
  "couples.week.meals_title": "Les repas de la semaine, décidés",
  "couples.week.meals_body":
    "Sept jours composés pour vous deux, d’un coup — pas une suggestion à trancher chaque soir. Vous ouvrez le plan, vous voyez ce qui est prévu, et vous changez ce que vous voulez.",
  "couples.week.sessions_title": "La semaine arrive en sessions de cuisine",
  "couples.week.sessions_body":
    "Une session peut préparer plusieurs repas. Le plan indique qui cuisine, quel jour, et combien de repas cette session permet de préparer.",
  "couples.week.waves_title": "Les courses en un ou deux passages",
  "couples.week.waves_body":
    "La liste suit le plan et se répartit en un ou deux passages. Les produits frais sont achetés avant les sessions de cuisine qui les utilisent.",

  "couples.fig.who.title": "Qui est dans le plan",
  // ⚠️ RÉÉCRITE LE 2026-09-01. Elle portait trois choses fausses ou opaques:
  // « une bouche du foyer » (le mot du code), « le profil réclamé » (idem),
  // et « pour deux euros par mois » — un tarif ÉCRIT EN LETTRES, donc
  // invisible au balayage des chiffres, et périmé. Le montant n'est plus ici
  // du tout: il est dans le bloc d'offre, une seule fois pour cinq pages.
  "couples.fig.who.desc":
    "La même maison, deux façons d’en être. Sans compte, l’autre est quand même une personne de la maison et reçoit quand même sa part. Son propre accès lui ajoute une entrée à lui, et un objectif qu’il change lui-même.",
  "couples.fig.who.eyebrow": "QUI EST DANS LE PLAN",
  "couples.fig.who.col_a": "SANS COMPTE",
  // ⚠️ « UNE BOUCHE DU FOYER » RETIRÉE LE 2026-09-01. Le mot est juste dans le
  // code (`mouths`, `keel_household_max_mouths`) et dur en vitrine: on parle
  // ici du conjoint de la personne qui lit.
  "couples.fig.who.a1": "une personne de la maison",
  "couples.fig.who.a2": "sa part est écrite",
  "couples.fig.who.a3": "inclus",
  // ⚠️ « PROFIL RÉCLAMÉ » A DISPARU DE LA VITRINE LE 2026-09-01. C'est le nom
  // du CODE (`claimed profile`, `keel_household_claim_*`), traduit
  // littéralement, et il ne veut rien dire pour quelqu'un qui achète: on ne
  // « réclame » pas un profil, on donne un accès à quelqu'un. Le terme reste
  // dans le code et dans la base, où il est juste.
  "couples.fig.who.col_b": "AVEC SON PROPRE ACCÈS",
  "couples.fig.who.b1": "son propre accès",
  "couples.fig.who.b2": "son objectif, modifiable",
  // ⚠️ LE MONTANT EST UN TROU, PAS UN MOT (2026-09-01): `{amount}` est rempli
  // par `formatPrice(PRICES.claimedProfile)`. Cette case portait « 2 € par
  // mois » en dur, et disait donc autre chose que `/families` au même moment.
  "couples.fig.who.b3": "{amount} par mois",
  "couples.fig.who.foot": "le compte qui ouvre la maison n’est jamais compté",

  // ── BANDE 4 — le prix et la clôture ─────────────────────────────────────
  "couples.price.kicker": "Le prix",
  "couples.price.title": "Une maison, un prix.",
  "couples.price.period": "par mois, pour la maison",
  // ⚠️ Le montant du second accès est un trou depuis le 2026-09-01: la phrase
  // le portait en dur (« 2 € par mois »), et `prices.ts` en disait un autre.
  "couples.price.label":
    "Un second accès coûte {amount} par mois. Votre propre accès est compris dans le prix de la maison.",
  "couples.price.note":
    "Le prix de base couvre déjà vos repas à deux. Le second accès personnel reste facultatif.",

  // ══ FAMILIES — la page du FOYER (`/families`) ═════════════════════════════
  //
  // L'ACHETEUSE, PRÉCISÉE LE 2026-08-31: une personne de 35-45 ans qui cuisine
  // tous les soirs et DÉCIDE SEULE de ce que tout le monde mange. Le qualifieur
  // est L'ENFANT, jamais le nombre de têtes — un parent seul avec un enfant est
  // le foyer le plus qualifié du marché (POSITIONNEMENT §2.3), et l'ancien
  // « Trois bouches à table, ou plus » l'écartait en toutes lettres.
  //
  // ⚠️ LE MOT « BOUCHE » A DISPARU DU CORPS DE LA PAGE. Il chosifie dès la
  // première ligne lue, sur une page qui parle à quelqu'un de compétent et de
  // fatigué. Il ne survit qu'aux endroits où il est le mot du PRODUIT (le
  // plafond de huit), et même là il dit « personnes ».
  //
  // ⚠️ AUCUN ADJECTIF ACCORDÉ AU LECTEUR. On cible les mères sans jamais
  // l'écrire: « seule », « fatiguée », « vue » sont interdits ici, parce qu'un
  // père qui porte l'organisation ne doit pas se lire comme une exception. La
  // charge se dit par des noms et des verbes.
  //
  // ORDRE DES CLÉS = ORDRE DES SIX BANDES:
  //   1. le héros           — la charge mentale (accroche n°1)
  //   2. la reconnaissance  — servie / absorbée / renoncée, puis le prix du gratuit
  //   3. le doute           — accroche n°2, et le bloc sombre
  //   4. le jeudi           — l'effondrement, et LA PREUVE (une semaine montrée)
  //   5. comment ça marche  — trois étapes
  //   6. le prix            — 11,99 €, premier mois offert
  "families.seo_title": "Les repas de la maison, décidés une fois pour la semaine",
  "families.seo_description":
    "Sophia compose la semaine de la maison : les repas, les sessions de cuisine et les courses en un ou deux passages. Une même session peut préparer plusieurs repas, avec une portion adaptée à chacun. 12,99 € par mois pour toute la maison, première semaine offerte.",

  // ── BANDE 1 · la charge mentale ─────────────────────────────────────────
  // ⚠️ « Vous ne cuisinez pas trop. Vous décidez trop. » — le titre dit ce
  // qu'on retire ET ce qu'on ne retire pas. Elle sait cuisiner; c'est la
  // DÉCISION qui pèse. Un titre qui promettrait de lui épargner la cuisine
  // s'adresserait à quelqu'un d'autre.
  "families.hero.kicker": "Quand il y a des enfants à la maison",
  "families.hero.title": "Vous ne cuisinez pas trop. Vous décidez trop.",
  "families.hero.lede":
    "Tenir en tête ce que chacun ne mange pas, ce dont chacun a besoin, puis en tirer les repas, les sessions de cuisine et la liste de courses. Ce travail revient chaque semaine, toujours à la même personne, et personne ne le voit. Sophia s’en charge ; la cuisine reste à vous.",

  // ── BANDE 2① · L'ÉQUILIBRE, DIT COMME UN MÉCANISME ──────────────────────
  // ⚠️ NEUVE LE 2026-09-01. La page posait la question du doute et y répondait
  // « composé pour chacun », sans jamais nommer CE QUI compose.
  // ⛔ On promet la COMPOSITION, jamais le résultat: pas de « tous les
  // apports », pas de taux de couverture (`coverage` compte les connus, pas
  // les pesés), AUCUN bilan sur un mineur, aucun chiffre, aucune courbe.
  // ⛔ Et pas de plancher protéique: il vit dans la lane individuelle.
  "families.balanced.kicker": "Ce qu’il y a dans l’assiette",
  // ⚠️ « LE MÊME PLAT » TOUT COURT ÉTAIT FAUX, CORRIGÉ LE 2026-09-01. C'était
  // la SEULE ligne des quatre pages à affirmer platement que tout le monde
  // mange le même plat. `mergeLadder` (`household_merge.ts`) a TROIS barreaux:
  // `one_dish`, `one_session` (deux plats, une seule cuisson) et
  // `separate_sessions`. C'est la DIVERGENCE qui tranche, pas une règle.
  // La forme retenue est celle de `/couples` et de la porte du hall, mot pour
  // mot: la condition d'abord, la promesse inconditionnelle ensuite.
  "families.balanced.title": "Le même plat quand c’est possible. Une portion adaptée à chacun.",
  "families.balanced.body":
    "Chaque assiette a ses trois composantes : une protéine, un féculent, des légumes. Ce qui change d’une personne à l’autre, ce n’est pas leur présence — c’est leur proportion, et la quantité.",
  // fact: `envelopeFor` compose sur l'âge, le corps et l'activité de CHAQUE
  // bouche — le foyer n'a pas UNE enveloppe, il en a une par personne.
  // ⚠️ C'EST ICI QUE VIT LA CLÔTURE RASSURANTE depuis la suppression de la
  // bande du doute. Elle nomme l'ÉQUILIBRE depuis le 2026-09-02 — voir
  // `mealprep.composed.note` pour le motif et le point LEGAL §6.1.
  "families.balanced.body_2":
    "La quantité tient compte de l’âge, du corps et du niveau d’activité de la personne qui mange. Un ado de quatorze ans et sa sœur de neuf ne reçoivent pas la même portion du même plat. Tout est prévu au moment de composer la semaine, pour que vous n’ayez rien à recalculer à table.",
  // ⚠️ LA RÈGLE DU PLAT, DITE LÀ OÙ LE LECTEUR SE FAIT SA CONVICTION — juste
  // au-dessus de la figure qui montre UNE casserole et quatre assiettes.
  // Sans elle, la figure se lit comme une règle alors qu'elle montre le cas
  // NOMINAL.
  // fact: `mergeLadder` — `one_dish` quand rien ne diverge; `one_session`
  // (deux plats, une seule cuisson) quand quelqu'un demande plus que ce que
  // le plat de l'autre contient, ou quand un régime descend la casserole au
  // plus strict (`household_diet.ts` R4/R5).
  // fact: LE CHOIX DE MODE DE CUISSON EST UN PLAFOND, JAMAIS UN ORDRE
  // (`household_portions.ts`): « il peut refuser un second plat, il ne peut
  // pas en fabriquer un ». Et quand le plafond mord, le plan le DIT
  // (`plan_rationale.ts`). C'est ce que dit la dernière phrase — ⛔ ne pas la
  // retourner en « vous choisissez d'avoir deux plats », qui serait faux.
  "families.balanced.one_or_two":
    "Le plus souvent, un seul plat suffit pour toute la table. Quand un régime ou une contrainte rend ce plat inadapté à quelqu’un, Sophia ajoute un second plat dans la même session de cuisine. Si vous préférez ne jamais cuisiner deux plats, vous pouvez le préciser : Sophia respectera cette limite et vous indiquera les conséquences.",
  "families.hero.cta": "Composer votre première semaine",
  // ⚠️ `families.hero.price_note` RETIRÉE LE 2026-09-01. C'était la SEULE des
  // quatre pages à annoncer une gratuité (« premier mois offert »), et elle
  // l'annonçait pour une durée que le produit ne tenait pas — `free_until`
  // gelait le foyer à J+31 sans chemin de dégel. L'offre est maintenant la
  // même partout (`ui/OfferLines.tsx`), et la durée annoncée est celle que
  // `HOUSEHOLD_TRIAL_DAYS` tient: SEPT jours.

  // La figure du héros: une casserole, quatre parts, et sous chaque part LA
  // RAISON qui la sépare de sa voisine. Les quatre parts sont dessinées à la
  // même taille — le produit rend un MOT sur un mineur, pas un ratio.
  "families.fig_table.label": "UNE CUISSON, DES ASSIETTES QUI DIFFÈRENT",
  "families.fig_table.a11y_title": "Une seule cuisson, quatre assiettes qui diffèrent",
  "families.fig_table.a11y_desc":
    "Une casserole en haut, avec le plat du soir. Quatre traits en descendent vers quatre assiettes dessinées à la même taille. Sous chaque assiette, un prénom et la raison pour laquelle sa part n’est pas celle de la voisine : un objectif d’adulte, deux âges, un aliment retiré de la casserole.",
  "families.fig_table.pot": "UNE SEULE CUISSON",
  "families.fig_table.dish": "Poulet, riz et haricots",
  "families.fig_table.m1": "Vous",
  "families.fig_table.m2": "Sami, 14 ans",
  "families.fig_table.m3": "Inès, 9 ans",
  "families.fig_table.m4": "Jo",
  "families.fig_table.why1": "votre objectif",
  "families.fig_table.why2": "il grandit",
  "families.fig_table.why3": "son âge",
  "families.fig_table.why4": "sans arachide",

  // ── BANDE 2 · les trois formes de la divergence ─────────────────────────
  // ⚠️ LA TROISIÈME CARTE EST CELLE QUI COMPTE. « Tout le monde mange pareil »
  // est un FAUX NÉGATIF: ce foyer a RENONCÉ parce que servir la différence
  // coûte trop cher à la main. Il n'a pas moins besoin du produit.
  "families.forms.kicker": "La table",
  "families.forms.title": "Chez vous, ça se passe de l’une de ces trois façons.",
  "families.forms.served_title": "Vous cuisinez deux fois.",
  "families.forms.served_body":
    "Un plat pour ceux qui peuvent le manger, un autre pour celui qui ne le peut pas. Tous les soirs, cela double le travail de la personne qui cuisine.",
  "families.forms.absorbed_title": "Un seul plat, mais très peu de choix.",
  "families.forms.absorbed_body":
    "Très peu de plats conviennent à tout le monde, mais il faut quand même remplir toute la semaine sans répéter les mêmes repas.",
  "families.forms.given_up_title": "Tout le monde mange pareil.",
  "families.forms.given_up_body":
    "Ce n’est pas que personne n’a de besoin différent. C’est que servir cette différence coûte trop cher quand une seule personne cuisine, le soir, pour tout le monde.",
  // ⚠️ RESTAURÉE LE 2026-09-01. `BRIEF-LANDING-FOYER.md` §5 nomme « Jow est
  // gratuit » comme L'OBJECTION PRINCIPALE et donne la réponse. Elle avait été
  // écrite, puis supprimée — le commentaire qui l'annonçait est resté orphelin
  // dans `FamiliesPage.tsx` (« c'est le seul endroit de la page qui dise
  // pourquoi on paie ») pendant que la phrase, elle, n'existait plus. Plus
  // aucune des quatre pages ne disait pourquoi on paie.
  // ⛔ ON NE NOMME AUCUN CONCURRENT, et on n'en dit aucun mal: on dit ce que
  // NOUS faisons de plus. Le second angle du brief (« le conseil gratuit est
  // financé par les marques ») n'est PAS repris — c'est une accusation sur un
  // tiers, et ce n'est pas à nous de la porter sur une page de vente.
  // ⚠️ LA BANDE DES CONTRAINTES A ÉTÉ SUPPRIMÉE LE 2026-09-02, sur décision
  // du propriétaire, avec ses quatre clés (`families.limits.*`): le titre,
  // l'allergie (fail-closed de `household_safety.ts`), le régime (R4/R5 de
  // `household_diet.ts`) et l'interdit parental.
  // ⚠️ CE QUI PART AVEC ELLE, ÉCRIT ICI POUR QUE PERSONNE NE LE REDÉCOUVRE:
  //   · le FAIL-CLOSED des allergies (« si Sophia ne peut pas les relire, elle
  //     ne compose pas ») n'est plus dit NULLE PART en vitrine — seul le
  //     libellé `families.fig_table.why4` (« sans arachide ») en garde la
  //     trace dessinée, sans une ligne pour l'expliquer;
  //   · l'interdit parental posable sans compte, et le fait que Sophia en
  //     EFFACE le motif dans le plat (`household_restriction_lock.ts`),
  //     quittent le site.
  // La règle du régime, elle, SURVIT: `families.balanced.one_or_two` la porte
  // sur cette page, et `couples.give_up.*` sur l'autre.
  // ⛔ Ne pas les « rétablir par symétrie » — c'est une décision produit.
  // La réponse à « un planificateur gratuit existe », sans nommer personne.
  // C'est le seul endroit de la page qui dise pourquoi on paie.

  // ── BANDE 3 · le doute (le bloc sombre) ─────────────────────────────────
  // ⛔ LA LIGNE EST NETTE: on COMPOSE POUR chacun, on ne fait JAMAIS DE BILAN
  // SUR un enfant. Le doute se retire, il ne se mesure pas — un écran qui
  // montrerait un déficit chez un enfant de 12 ans rendrait cette lectrice
  // plus anxieuse, pas moins.
  // ⚠️ LES QUATRE CLÉS `families.doubt.*` ONT ÉTÉ RETIRÉES LE 2026-09-01 avec
  // leur bande, sur décision du propriétaire. Le fond sombre qu'elle portait
  // est passé à `families.forms.*` — « la table », les trois façons.
  // ⚠️ CE QU'ELLES PORTAIENT ET QUI N'A PAS DISPARU: la clôture « vous n'avez
  // plus à vous demander si ça suffit », repliée dans
  // `families.balanced.body_2`. C'est la seule réponse de la page à la
  // question qu'elle pose; la retirer de là aussi la laisserait sans réponse.
  // ⚠️ RACCOURCIE LE 2026-09-01. Elle portait le mécanisme — « son âge, son
  // corps, ce qu'il fait de ses journées » — que la bande `Balanced`, juste
  // au-dessus, dit maintenant en entier. Répéter un mécanisme sur le bloc
  // sombre lui vole sa place: ce bloc-ci répond, il n'explique pas.
  // ⛔ LA CLÔTURE NE BOUGE PAS: « vous n'avez plus à vous demander si ça
  // suffit » est la tournure autorisée du dépôt — elle enlève l'inquiétude
  // sans promettre un résultat, et elle ne devient JAMAIS « c'est suffisant ».

  // ── BANDE 4 · le jeudi, et la preuve ────────────────────────────────────
  "families.thursday.kicker": "Le jeudi",
  "families.thursday.title": "Quand une cuisson saute, Sophia recale les repas qui en dépendent.",
  // ⚠️ DEUX PARAGRAPHES DE LONGUEUR VOISINE — ils sont rendus côte à côte de
  // la figure, et l'un beaucoup plus court laisse une colonne creuse.
  // ⚠️ RÉÉCRITS POUR UNE FAMILLE LE 2026-09-01: à quatre bouches, une cuisson
  // sautée ne prive pas une personne mais trois, et les courses non faites
  // sont le seul accident qui menace la semaine entière.
  "families.thursday.body":
    "Si la cuisson du dimanche n’a pas lieu, plusieurs repas de la semaine deviennent impossibles. Dans une famille, un seul imprévu peut donc affecter les repas de plusieurs personnes pendant plusieurs jours.",
  // ⚠️ « SE DÉCALE » ET PAS « DU SANS-CUISSON ». Un tap « la cuisson n'a pas
  // eu lieu » fait la cascade puis PROPOSE LE DÉCALAGE de la session et de ce
  // qui en dépendait (`accident_tap.ts`, « l'action n°5 »). Le sans-cuisson
  // est une option conditionnelle, pas la réponse — corrigé sur `/meal-prep`.
  // ⚠️ « 3 JOURS » EST LE CHIFFRE DU MOTEUR: `MAX_FRIDGE_DAYS = 3`.
  // ⚠️ `FF-057` est 🟠 EN COURS — livrée par la conversation, à moitié par
  // l'écran. On écrit « vous le dites », jamais « un bouton ».
  "families.thursday.repair":
    "Vous dites ce qui a changé. Sophia propose alors de déplacer la session de cuisine et les repas associés. Elle ne déplace un plat que si les produits frais déjà achetés peuvent encore être consommés à la nouvelle date.",
  // ⚠️ `families.thursday.reserve` A ÉTÉ REPLIÉE DANS `repair` LE 2026-09-01.
  // Elle disait le refus de décaler quand un produit frais ne tiendrait pas —
  // un fait vrai (`perishables_at_risk`) et le seul chemin où cette garde mord
  // vraiment. Il n'a pas disparu: il ferme maintenant le second paragraphe,
  // qui a besoin de sa longueur pour équilibrer la colonne d'en face.

  // ── LA FIGURE DES TROIS ACCIDENTS — partagée avec `/meal-prep` et
  // `/couples` (`ui/AccidentsFigure.tsx`), clés propres à cette page.
  "families.fig.moves.label": "TROIS ACCIDENTS",
  "families.fig.moves.title": "Les trois accidents qu’une semaine encaisse",
  "families.fig.moves.desc":
    "Trois cartes, un accident par carte, et ce qui tombe grandit de gauche à droite. Sur la première, une seule assiette en pointillé. Sur la deuxième, une casserole en pointillé et les trois assiettes qu’elle nourrit. Sur la troisième, un panier en pointillé au-dessus de la casserole et de ses trois assiettes.",
  "families.fig.moves.dish": "UN REPAS SAUTÉ",
  "families.fig.moves.session": "UNE CUISSON SAUTÉE",
  "families.fig.moves.shopping": "DES COURSES NON FAITES",

  // La figure de la preuve: une semaine montrée, puis la même après la cuisson
  // sautée. ⚠️ Les jours sont abrégés en trois lettres et non en initiales:
  // « S » vaudrait « samedi » ici et « Saturday » en face, donc une valeur
  // identique dans les deux packs à blanchir dans le test de parité.
  "families.fig_week.label": "UNE SEMAINE, COMPOSÉE",
  "families.fig_week.a11y_title": "Une semaine composée : les repas, les courses et la cuisson",
  "families.fig_week.a11y_desc":
      "Sept jours, sur une rangée. Chaque jour porte un repas. Dans cet exemple, deux passages de courses sont placés le lundi et le vendredi, avant la session de cuisine du même jour. Une accolade court sous les trois soirs que chaque cuisson couvre ; le jeudi n’est sous aucune des deux.",
  "families.fig_week.waves": "JUSQU’À DEUX PASSAGES DE COURSES",
  "families.fig_week.d1": "LUN",
  "families.fig_week.d2": "MAR",
  "families.fig_week.d3": "MER",
  "families.fig_week.d4": "JEU",
  "families.fig_week.d5": "VEN",
  "families.fig_week.d6": "SAM",
  "families.fig_week.d7": "DIM",
  "families.fig_week.planned": "COMPOSÉE",
  "families.fig_week.cooking": "CUISSON",
  // ⚠️ DEUX CUISSONS, ET JEUDI RESTE HORS DES DEUX ACCOLADES — C'EST EXACT,
  // PAS UN OUBLI. `MAX_FRIDGE_DAYS = 3`, et `fridge_window.ts` a corrigé un
  // défaut ① en passant la comparaison à `>=`: « cuit dimanche, mangé
  // mercredi » était REJETÉ. Une cuisson couvre donc le jour même + 2, soit
  // TROIS soirs. Lundi tient lundi-mardi-mercredi, vendredi tient
  // vendredi-samedi-dimanche: jeudi tombe entre les deux.
  // ⛔ Ne pas étirer l'accolade du lundi jusqu'à jeudi pour « boucher le
  // trou »: ce serait dessiner ce que le moteur refuse d'exécuter.
  "families.fig_week.covers": "Chaque cuisson sert trois soirs ; le jeudi se compose autrement.",
  // Le SECOND plat de la semaine. Il existe parce que la figure montre
  // maintenant deux cuissons, et que deux accolades sous le même nom de plat
  // diraient qu'on mange la même chose sept soirs de suite.
  "families.fig_week.dish2": "Curry de pois chiches",
  // ⚠️ `skipped`, `moved` ET `caption` ONT ÉTÉ RETIRÉES LE 2026-09-01 avec la
  // seconde rangée de la figure. Elle montrait la cuisson qui saute — UN des
  // trois accidents du produit — et cet argument a maintenant sa bande à lui,
  // avec `ui/AccidentsFigure.tsx`. Cette figure-ci est montée dans le héros,
  // où son travail est de montrer un plan RÉEL, pas un accident.

  // ── BANDE 5 · comment ça marche ─────────────────────────────────────────
  // ⚠️ AUCUNE DURÉE. « Dix minutes » n'est mesuré nulle part, et l'entonnoir
  // est long: on dit les CHAMPS demandés, et le fait que la première étape ne
  // se refait pas.
  "families.how.kicker": "Comment ça marche",
  "families.how.title": "Trois étapes, et la première ne se fait qu’une fois.",
  "families.how.s1_step": "D’abord",
  "families.how.s1_title": "Vous dites qui mange ici.",
  "families.how.s1_body":
    "Prénom, date de naissance, objectif, ce que chacun ne mange pas. Vos enfants sont dans le plan sans compte, sans écran, sans mot de passe.",
  "families.how.s2_step": "Ensuite",
  "families.how.s2_title": "La semaine arrive composée.",
  "families.how.s2_body":
    "Les repas, les sessions de cuisine placées selon vos disponibilités et les courses en un ou deux passages. Vous validez le plan, puis vous changez ce que vous voulez.",
  "families.how.s3_step": "Après un imprévu",
  "families.how.s3_title": "Vous dites ce qui a changé.",
  "families.how.s3_body":
    "Sophia recale les repas et les sessions de cuisine concernés jusqu’à la fin de la semaine.",

  // ── BANDE 6 · le prix, et la sortie ─────────────────────────────────────
  // ⚠️ LE MONTANT EST ENCASTRÉ DANS LA PHRASE, DONC IL EST ICI ET PAS DANS
  // `PRICES` (voir l'en-tête de `i18n/prices.ts`). La carte, elle, rend
  // `formatPrice(PRICES.household)`. Si le tarif bouge, `price.body`,
  // `hero.price_note` et `seo_description` bougent AVEC lui.
  "families.price.kicker": "Le prix",
  "families.price.title": "Un prix pour la maison. Pas un par personne.",
  "families.price.period": "par mois, la maison entière",
  "families.price.label": "Jusqu’à huit personnes. Votre accès est inclus.",
  // ⚠️ RÉÉCRITE LE 2026-09-01. Elle portait TROIS faits d'offre — le mois
  // offert, l'invariance au nombre de convives, et « un accompagnement à
  // 1,99 € » — dont deux étaient faux ailleurs sur le site: aucune autre page
  // ne parlait de gratuité, et l'« accompagnement » ne désigne rien que le
  // produit sache faire (le code ne connaît qu'un ACCÈS de plus). Les faits
  // d'offre sont partis dans `offer.*`; il ne reste ici que l'ARGUMENT, qui
  // est propre à cette page: pourquoi le prix ne suit pas la tablée.
  "families.price.body":
    "Une personne de plus à table ne change pas le prix. Une famille nombreuse ne paie donc pas davantage pour organiser ses repas.",

  "families.fig_price.label": "LE PRIX SUIT LA MAISON",
  "families.fig_price.a11y_title": "Huit places, un seul prix",
  "families.fig_price.a11y_desc":
    "Une rangée de huit places. La première représente votre accès inclus ; trois autres sont occupées, quatre restent libres et sont bordées de pointillés. Le prix inscrit dessous ne change pas quand une place se remplit.",
  "families.fig_price.you": "VOUS",
  "families.fig_price.not_counted": "VOTRE ACCÈS INCLUS",
  "families.fig_price.cap": "PLAFOND : 8 PERSONNES",
  "families.fig_price.taken": "OCCUPÉE",
  "families.fig_price.free": "LIBRE",
  "families.fig_price.steady": "Le prix ne change pas quand une place se remplit.",

  // ── COACHES — la page des formations (`/coaches`) ───────────────────────
  //
  // REGISTRE: `/coaches` TUTOIE (en-tête de `fr.ts`). On tutoie la personne qui
  // est entrée; on vouvoie l'acheteur qu'on ne connaît pas. `/pro` et `/gyms`
  // vouvoient ET disent « clients »; ici c'est « élèves », parce qu'ils ont
  // choisi quelqu'un pour apprendre de lui.
  //
  // COMPOSITION: apostrophe typographique ’ (U+2019), espace insécable U+00A0
  // avant : ; ! ? » € % et après «. JAMAIS U+202F — mesurée sans glyphe dans les
  // deux polices. Pas de → : il n'existe dans aucune des deux familles.
  //
  // CE N'EST PAS UN CALQUE. « Your course ends. Your coaching doesn't. » a un
  // rythme qui ne survit pas à la traduction mot à mot.
  // ── SEO ─────────────────────────────────────────────────────────────────
  "coaches.seo_title": "Sophia — ta méthode répond à tes élèves, tous les jours",
  "coaches.seo_description":
    "Tu as enregistré ta méthode une fois. Sophia répond à tes élèves avec elle tous les jours — dans le chat, dans chaque semaine et dans chaque repas qu’elle rédige. Ce qu’elle écrit dans le chat est relu contre tes lignes rouges avant d’être envoyé, sans modèle dans cette boucle. 7 € par élève et par mois, sans forfait de plateforme.",

  // ── BANDE 1 — DOULEUR 01 ────────────────────────────────────────────────
  "coaches.hero.kicker": "Pour les coachs qui vendent une méthode, pas des heures",
  "coaches.hero.title": "Ta formation se termine. Ton coaching, non.",
  "coaches.hero.lede":
    "Tu as enregistré ta méthode une fois. Sophia répond à tes élèves avec elle, tous les jours — la question de 21 h, la semaine qu’ils composent, les repas qu’elle rédige. Ce que tu ne pouvais vendre qu’une fois devient ce qu’on paie chaque mois.",
  "coaches.hero.cta": "Démarrer l’essai de 14 jours",
  "coaches.hero.note":
    "14 jours, jusqu’à 3 élèves, puis ça s’arrête tout seul. Ils entrent sur invitation par e-mail et reçoivent un espace à eux. Rien ne revient dans une boîte de réception chez toi — il n’y en a pas.",
  "coaches.hero.fig_caption":
    "Tu l’enregistres une fois, dans un entretien guidé. Tu la révises quand tu veux — une correction s’applique dès le message suivant — et tu reviens à une version précédente sans perdre ce que tes élèves ont déjà reçu.",

  "coaches.fig.after.title": "La formation s’arrête ; la méthode continue de répondre",
  "coaches.fig.after.desc":
    "Deux lignes sur une même durée. La formation est une boîte fermée, qui s’arrête à la dernière vidéo. La méthode, enregistrée au même moment, ne se referme pas à droite : elle continue au-delà, et répond jour après jour.",
  "coaches.fig.after.eq": "APRÈS LA DERNIÈRE VIDÉO",
  "coaches.fig.after.course": "TA FORMATION",
  "coaches.fig.after.modules": "les modules",
  "coaches.fig.after.end": "ELLE S’ARRÊTE ICI",
  "coaches.fig.after.method": "TA MÉTHODE",
  "coaches.fig.after.recorded": "enregistrée une fois",
  "coaches.fig.after.every_day": "elle répond, jour après jour",

  // ── BANDE 2 — DOULEUR 02 ────────────────────────────────────────────────
  "coaches.day.kicker": "Mardi, 21 h",
  "coaches.day.title": "Les questions qui arrivent quand tu n’es pas là.",
  // ⚠️ Voir la note du bloc anglais: la question du remplacement tombait sur la
  // chaîne 1:1, que ce produit ne vend pas.
  "coaches.day.q1": "« J’ai vraiment besoin d’un petit-déjeuner ? »",
  "coaches.day.q2": "« Je meurs de faim à 16 h — c’est normal ? »",
  "coaches.day.q3": "« J’ai mal mangé à un mariage. J’ai foutu la semaine en l’air ? »",
  "coaches.day.body":
    "Aucune n’est dans un module : elles portent sur ce soir, cette cuisine, cette semaine. Chacune a une réponse, et cette réponse est la tienne — tu l’as tranchée cent fois. Ils s’éloignent parce que mardi soir, personne qui pense comme toi n’était là.",
  "coaches.day.reserve":
    "Rien de tout ça ne te revient. Pas de boîte de réception, pas de file de réponses, pas de fil qui attend ta soirée : tes élèves posent la question dans leur espace, et la réponse est là — sans passer par toi.",

  "coaches.fig.method.title": "Une méthode, quatre endroits où elle est écrite",
  "coaches.fig.method.desc":
    "La méthode publiée à gauche. À droite, les quatre choses que Sophia compose pour un élève : son chat, la semaine qu’il compose, les repas qu’elle rédige, les repas de son foyer — chacune avec la méthode dedans.",
  "coaches.fig.method.eq": "ENREGISTRÉE UNE FOIS",
  "coaches.fig.method.source": "TA MÉTHODE",
  "coaches.fig.method.l1": "tes convictions",
  "coaches.fig.method.l2": "tes lignes rouges",
  "coaches.fig.method.l3": "ce que tu dis à la place",
  "coaches.fig.method.l4": "ton vocabulaire",
  // ⚠️ TROIS SORTIES DEPUIS LE 2026-08-19 — voir le commentaire d'en.ts.
  "coaches.fig.method.out1": "son chat",
  "coaches.fig.method.out2": "les repas rédigés",
  "coaches.fig.method.out3": "les repas du foyer",

  // ── BANDE 3 — DOULEUR 03 · LE BLOC SOMBRE ───────────────────────────────
  "coaches.lock.kicker": "La partie qui devrait te faire le plus peur",
  "coaches.lock.title": "Une IA qui parle en ton nom est un risque. On le traite comme tel.",
  "coaches.lock.body":
    "Un prompt est une consigne, pas une garantie. Dis à n’importe quel modèle « ne recommande jamais six petits repas » et il obéira presque toujours — et presque toujours est le mauvais chiffre quand une seule contradiction publique est ce que tes élèves retiendront.",
  "coaches.lock.scope":
    "Alors ta méthode entre dans le chat et dans chaque repas que Sophia rédige. Ça, c’est une consigne. La suite n’en est pas une : ce qu’elle écrit dans le chat est relu contre tes lignes rouges avant d’être envoyé, par du code, sans modèle dans cette boucle.",
  "coaches.lock.reserve":
    "Ton élève ne reçoit jamais un refus, et jamais un « demande à ton coach » — dans une masterclasse, ça désigne une porte qui n’existe pas. Là où tu n’as rien écrit à la place, ce qui part est notre phrase à nous, non signée : on ne met pas ton nom sur des mots que tu n’as pas écrits.",

  // ── LA DÉMONSTRATION ────────────────────────────────────────────────────
  "coaches.lock.demo.eq": "DANS LE CHAT, AVANT L’ENVOI",
  "coaches.lock.demo.written_label": "CE QUE TU AS ÉCRIT, UNE FOIS",
  "coaches.lock.demo.line_label": "ta ligne rouge",
  "coaches.lock.demo.line_value": "six petits repas",
  "coaches.lock.demo.instead_label": "ce que tu dis à la place",
  "coaches.lock.demo.instead_value":
    "Trois vrais repas. Si tu as faim entre les deux, c’est que le repas d’avant était trop petit.",
  "coaches.lock.demo.group_label": "SI LE MODÈLE ÉCRIT",
  "coaches.lock.demo.draft_a": "« Essaie six petits repas dans la journée. »",
  "coaches.lock.demo.draft_b": "« Ton coach ne fait pas de six petits repas. »",
  "coaches.lock.demo.out_label": "CE QUE TON ÉLÈVE LIT",
  "coaches.lock.demo.verdict_a": "Retenu, et remplacé.",
  "coaches.lock.demo.verdict_b": "Envoyé tel quel.",
  "coaches.lock.demo.why_a":
    "Le message entier est remplacé par ta phrase, et signé de ton nom.",
  "coaches.lock.demo.why_b":
    "Nommer ta ligne rouge pour l’expliquer, c’est ta méthode qui fonctionne : rien n’y touche.",
  // ⚠️ Voir la note du bloc anglais: c’est la fiche du lecteur, pas celle de Marc.
  "coaches.lock.demo.sign": "— ton nom",
  "coaches.lock.demo.foot":
    "Deux brouillons, une ligne rouge. La relecture est une règle que tu as écrite, appliquée par du code : aucun modèle ne décide si un message part.",

  // ── BANDE 4 — LE PRIX ET LA CLÔTURE, FUSIONNÉS ──────────────────────────
  "coaches.price.kicker": "Le prix",
  "coaches.price.title":
    "Tu as déjà écrit la méthode. Voici ce qui la rend payable chaque mois.",
  "coaches.price.seat_period": "par élève et par mois",
  "coaches.price.seat_label":
    "Pas de forfait de plateforme. Pas de frais d’installation. Pas de palier à dépasser.",
  "coaches.price.yearly":
    "le siège si tu paies à l’année — c’est ton échéance à toi, pas celle de ton élève.",
  "coaches.price.body":
    "Tu paies les élèves que tu as inscrits, et tu arrêtes de payer le mois où tu éteins un siège. Ce que tu leur factures est à toi — nous ne facturons jamais ton élève. Pour t’abonner, il te faut au moins un élève rattaché : c’est le siège qu’on facture.",
  "coaches.price.no_number":
    "Ce que vaut un élève qui reste au lieu de s’éloigner, c’est ton chiffre, pas le nôtre. Nous n’avons pas de chiffre de rétention à te vendre, et nous n’allons pas en inventer un.",
  "coaches.price.cta": "Démarrer l’essai de 14 jours",
  "coaches.price.trial_note": "14 jours, jusqu’à 3 élèves, puis ça s’arrête tout seul.",

  // ── GYMS — la page des salles (`/gyms`) ─────────────────────────────────
  //
  // REGISTRE: `/gyms` VOUVOIE (fixé par l'en-tête de `fr.ts`).
  // VOCABULAIRE: des CLIENTS. « Élève » est le mot de `/coaches` seulement, et
  // ⛔ « votre équipe » n'existe pas ici — une salle à trois coachs est UN compte
  // (B20). ⛔ « Suivi personnalisé » est interdit partout.
  //
  // COMPOSITION: apostrophe typographique ’ (U+2019), espace insécable U+00A0
  // avant : ; ! ? » € % et après «. ⛔ JAMAIS U+202F (mesurée sans glyphe dans
  // les deux polices). ⛔ Pas de flèche U+2192 en texte courant: dans une figure, la flèche
  // se DESSINE.
  "gyms.seo_title": "Sophia pour les salles — le palier nutrition que vous n’avez pas à écrire",
  "gyms.seo_description":
    "Vos clients s’entraînent sérieusement et mangent au hasard. Sophia est un palier nutrition au-dessus de l’abonnement : un agent répond à chaque client que vous rattachez, tous les jours, et vous n’écrivez rien — vous déléguez à la méthode de Sophia, et l’agent signe du nom de Sophia, jamais du vôtre. 7 € par client rattaché et par mois.",

  // ── BANDE 1 · douleur 01 ────────────────────────────────────────────────
  // ⚠️ Le titre ne dit plus « vous coachez trois heures par semaine ». Une
  // salle ne coache pas : ses clients s’entraînent, et la plupart n’ont aucun
  // coach. C’est le recadrage du segment.
  "gyms.hero.eyebrow": "Pour les salles indépendantes — box, salles de force, studios hybrides",
  "gyms.hero.title": "Ils s’entraînent sérieusement. Ils mangent au hasard.",
  "gyms.hero.lede":
    "Trois heures par semaine dans votre salle, et vingt et un repas où personne ne demande rien. C’est cette moitié-là qui décide de ce que renvoie le miroir — et un client qui ne voit plus son corps changer ne vient pas vous en parler, il cesse de venir. Sophia est un palier nutrition au-dessus de votre abonnement : un agent répond à chaque client que vous rattachez, tous les jours. Personne n’écrit de menu, et personne n’embauche de diététicien.",
  "gyms.hero.cta": "Commencer l’essai de 14 jours",
  "gyms.hero.trial_note": "14 jours, 3 clients au plus, puis ça s’arrête tout seul.",

  "gyms.fig.week_t": "La semaine d’un client : trois séances dans la salle, vingt et un repas ailleurs",
  "gyms.fig.week_d":
    "Une semaine dessinée en marques. La ligne du haut porte les trois séances dans la salle. Celle du bas porte les vingt et un repas qui se passent là où la salle n’est pas.",
  "gyms.fig.week_label": "LA SEMAINE D’UN CLIENT",
  "gyms.fig.week_row1": "TROIS HEURES DANS LA SALLE",
  "gyms.fig.week_row2": "VINGT ET UN REPAS, PARTOUT AILLEURS",

  "gyms.day.title": "Il est réveillé à 21 h un mardi soir. Vous êtes chez vous.",
  "gyms.day.body":
    "Un client pose sa question au moment où il l’a, et la réponse est construite depuis la méthode qui tient son compte — dans le chat, et dans chaque repas que Sophia rédige.",

  "gyms.money.title": "C’est vous qui le vendez. C’est vous qui fixez le prix.",
  "gyms.money.body":
    "Vous payez 7 € par client rattaché, et vous décidez de ce que le palier coûte de votre côté du comptoir. Aucun forfait plateforme, aucune installation, et vous cessez de payer le mois où vous éteignez un siège.",
  "gyms.money.caption":
    "Un exemple, et il le dit : nous ne connaissons ni votre taux de prise ni le prix que vous fixeriez, et ce sont les deux chiffres qui décident du total.",
  // B31 — VERBATIM. Ne pas réécrire cette phrase.
  "gyms.money.close":
    "Ce que vous achetez, ce sont des mois d’abonnement. Combien vaut, pour vous, un client qui reste trois mois de plus ? C’est le chiffre à mettre en face de 7 €, et il est à vous, pas à nous : nous n’avons pas de chiffre de rétention à vous vendre, et nous n’allons pas en inventer un.",

  // Les nombres ne bougent pas ; seule la mise en forme suit le français
  // (insécable avant €, « 8 000 » et non « 8,000 »).
  "gyms.fig.money_t": "Un exemple chiffré pour une salle de 250 clients",
  "gyms.fig.money_d":
    "Quatre lignes d’arithmétique. Trente-sept clients à 25 € chacun font 925 € encaissés ; sept euros chacun pour Sophia font 259 € payés ; 666 € restent à la salle.",
  "gyms.fig.money_label": "UN EXEMPLE — UNE SALLE DE 250 CLIENTS",
  "gyms.fig.money_uptake_label": "Sur le palier nutrition",
  "gyms.fig.money_uptake_value": "37 clients",
  "gyms.fig.money_uptake_hint": "15 % de prise, arrondi à l’entier inférieur",
  "gyms.fig.money_in_label": "Ils vous paient 25 € chacun",
  "gyms.fig.money_in_value": "925 €",
  "gyms.fig.money_out_label": "Vous payez 7 € chacun à Sophia",
  "gyms.fig.money_out_value": "− 259 €",
  "gyms.fig.money_keep_label": "Il vous reste, chaque mois",
  "gyms.fig.money_keep_value": "666 €",
  "gyms.fig.money_keep_hint": "environ 8 000 € par an",

  // ── BANDE 2 · douleur 02 ────────────────────────────────────────────────
  "gyms.monday.eyebrow": "Chaque lundi",
  "gyms.monday.title": "Les noms qui valent un message, pendant qu’on peut encore les joindre.",
  "gyms.monday.body":
    "Une page, calculée sur ce qui s’est passé et rendue par un gabarit. Aucun modèle ne la rédige, et c’est pour ça qu’elle ne peut pas vous flatter. Un client qui a écrit dans les deux derniers jours est joignable ; au-delà de deux jours, il décroche ; au-delà de cinq, il est silencieux — compté sur son dernier message entrant, pas sur le nôtre.",
  "gyms.monday.close":
    "Celui qui décroche est le seul utile : il est encore joignable, et un message de vous arrive encore. Votre logiciel de badges vous dira la même chose dans six semaines, et le mot sera « ancien client ».",
  "gyms.monday.scope": "Vous voyez les clients que vous avez rattachés, et personne d’autre.",
  "gyms.monday.fig_caption":
    "Un schéma de cette page. Les noms sont inventés ; le titre, les motifs et les états sont les mots du produit.",

  // ⚠️ CE BLOC ÉTAIT EN ANGLAIS, SOUS UNE LÉGENDE QUI JURAIT QUE C’ÉTAIT LES
  // MOTS DU PRODUIT. Le commentaire qui le justifiait disait « l’app
  // authentifiée est en anglais » — c’était vrai, ça ne l’est plus depuis le
  // lot 5. Le lundi d’un gérant francophone dit « Cette semaine » et « À qui
  // écrire »: la maquette montrait donc à un acheteur français un écran qui
  // n’existe dans aucune langue, ce qui est EXACTEMENT la faute que S10
  // existe pour éviter — la règle avait survécu à sa cause.
  //
  // Chaque valeur ci-dessous est recopiée de sa clé produit, dans ce fichier:
  //   monday_app   ← `coach.weekly.title`             (:3693)
  //   monday_worth ← `coach.weekly.flagged_title`     (:3702)
  //   monday_r1    ← `coach.flag.slipping_contact`    (:3721)
  //   monday_r2    ← `coach.flag.silent_5d`           (:3720)
  //   monday_r3    ← `coach.flag.coverage_below_gate` (:3723)
  //   monday_s3    ← `coach.weekly.no_number`         (:3705)
  // Seuls les trois PRÉNOMS sont inventés, et la légende le dit.
  "gyms.fig.monday_t": "La page du lundi : les clients qui valent un message",
  "gyms.fig.monday_d":
    "Trois clients qui valent un message, chacun avec le motif observé et son état de contact — et, sur le troisième, la mention qu’il n’y a aucun chiffre à montrer.",
  "gyms.fig.monday_app": "Cette semaine",
  "gyms.fig.monday_worth": "À QUI ÉCRIRE",
  "gyms.fig.monday_n1": "Chen Wei",
  "gyms.fig.monday_r1": "S’éloigne",
  "gyms.fig.monday_s1": "S’éloigne",
  "gyms.fig.monday_n2": "Amina Diop",
  "gyms.fig.monday_r2": "N’a rien écrit depuis plusieurs jours",
  "gyms.fig.monday_s2": "Silence",
  "gyms.fig.monday_n3": "Luca Ferrari",
  "gyms.fig.monday_r3": "N’a presque rien noté",
  "gyms.fig.monday_s3": "aucun chiffre à montrer",

  // ── BANDE 3 · douleur 03 — la délégation. Le seul argument NEUF. ─────────
  "gyms.house.eyebrow": "Rien à écrire",
  "gyms.house.title": "Vous n’avez pas de méthode à prêter. Vous n’en avez pas besoin.",
  "gyms.house.body":
    "Une salle vend une salle, pas une doctrine, et s’inventer une légitimité qu’on n’a pas serait la pire chose à faire avec un agent. Alors vous déléguez : vos clients sont suivis par la méthode de Sophia, et l’agent le dit — il signe « Sophia », jamais votre nom.",
  "gyms.house.sign_title": "Un seul nom, partout où un nom apparaît.",
  "gyms.house.sign_body":
    "La conversation et le message hebdomadaire à votre cohorte lisent la même réponse à « qui signe ça ». Un client ne rencontre jamais deux identités.",
  "gyms.house.one_title": "Un compte, une signature.",
  "gyms.house.one_body":
    "Une salle à trois coachs est un compte. Il n’y a pas d’entité salle au-dessus, ni de liste de coachs dedans.",
  "gyms.house.reserve":
    "Deux choses à savoir avant de basculer. Ça se défait : coupez la délégation et l’agent signe de nouveau de votre nom et sert ce que vous avez publié — rien de ce que vous aviez écrit n’est supprimé entre-temps. Et la méthode de la maison est en cours d’écriture en ce moment même : ce que vous activez aujourd’hui, c’est la délégation, pas une bibliothèque finie.",

  "gyms.fig.house_t": "La délégation : la salle n’écrit rien, et un seul nom signe les deux surfaces",
  "gyms.fig.house_d":
    "À gauche, la méthode de la salle : une carte vide. Deux branches en partent vers les deux endroits où un client rencontre un nom, et les deux sont signés Sophia.",
  "gyms.fig.house_label": "QUI SIGNE",
  "gyms.fig.house_gym": "VOTRE SALLE",
  "gyms.fig.house_gym_v": "rien d’écrit",
  "gyms.fig.house_s1": "LA CONVERSATION",
  "gyms.fig.house_s2": "LE MESSAGE DE LA SEMAINE",
  "gyms.fig.house_sign": "— Sophia",

  // ── BANDE 4 · le prix et la clôture ─────────────────────────────────────
  // ⚠️ `annual` est la CORRECTION du claim faux B2 : l’intervalle annuel est
  // celui du coach, jamais du client. « pour un siège payé à l’année ».
  "gyms.price.eyebrow": "Le prix",
  "gyms.price.title": "7 € par client. C’est vous qui fixez ce qu’il paie.",
  "gyms.price.seat_period": "par client rattaché et par mois",
  "gyms.price.seat_label": "Aucun forfait plateforme. Aucune installation. Rien d’autre.",
  "gyms.price.annual": "6 € pour un siège payé à l’année.",
  "gyms.price.why":
    "Vous payez les sièges que vous avez ouverts, et vous cessez de payer le mois où vous en éteignez un. S’abonner demande au moins un client rattaché : le premier siège vient donc avant la première facture.",
  "gyms.price.billing_note":
    "Vous facturez vos clients vous-même, sur ce que vous employez déjà pour l’abonnement. Sophia ne touche jamais à leur paiement.",
  "gyms.price.cta": "Commencer l’essai de 14 jours",
  "gyms.price.trial_note": "14 jours, 3 clients au plus, puis ça s’arrête tout seul.",
  "gyms.close.line": "Vous menez l’entraînement. Voici les vingt et un autres repas.",

  // ── COMMUNITIES — la page des communautés (`/communities`) ──────────────
  //
  // REGISTRE: `/communities` VOUVOIE (`fr.ts`, en-tête « LE REGISTRE, ET LÀ OÙ IL
  // BASCULE »). Les gens que le lecteur accompagne sont des MEMBRES — « élève »
  // est le mot de `/coaches` seulement.
  //
  // ⚠️ Ce n'est PAS un calque. Les tournures anglaises ont un rythme qui ne
  // survit pas à la traduction mot à mot.
  //
  // COMPOSITION: apostrophe typographique ’ (U+2019), espace insécable U+00A0
  // avant : ; ! ? » € % et après «. ⛔ JAMAIS U+202F (sans glyphe dans les deux
  // polices). ⛔ Pas de → (U+2192): il n'existe dans aucune des deux familles.
  "communities.seo_title":
    "Sophia pour les communautés payantes — la réponse qu’un fil ne donne pas",
  "communities.seo_description":
    "Une communauté est un fil : vous répondez en public, et aucun membre n’a de réponse à lui. Sophia est la couche du dessous — chaque membre du palier coaché a son espace, sa semaine et ses réponses, composés à partir de votre méthode. 7 € par membre et par mois.",

  // ── BANDE 1 · DOULEUR 01 — un fil n'a pas de destinataire ────────────────
  "communities.hero.kicker": "Pour ceux qui tiennent une communauté payante",
  "communities.hero.title": "Une communauté est un fil. Un fil ne répond pas à une personne.",
  "communities.hero.lede":
    "Aucune heure de plus n’y changera rien : c’est la forme même de ce que vous avez construit. Sophia est la couche du dessous — chaque membre du palier coaché a son espace, sa semaine et ses réponses, tirés de votre méthode.",
  "communities.hero.cta": "Commencer l’essai de 14 jours",
  "communities.hero.note":
    "14 jours, 3 membres au plus, puis ça s’arrête tout seul. Vos membres entrent par une invitation e-mail envoyée depuis votre espace, et rien ne vous revient sous forme de boîte de réception.",
  "communities.hero.signin_prompt": "Déjà sur Sophia ?",
  "communities.hero.signin_link": "Se connecter",

  "communities.fig_lane.label": "UNE QUESTION, DEUX DESTINATIONS",
  "communities.fig_lane.alt_title": "Une réponse pour tous, ou une réponse à chacun",
  "communities.fig_lane.alt_desc":
    "Les mêmes quatre membres, dessinés deux fois. À gauche, un seul trait les ouvre tous les quatre : c’est une réponse publique, écrite pour convenir à tout le monde. À droite, un trait chacun.",
  "communities.fig_lane.thread_label": "DANS LE FIL",
  "communities.fig_lane.tier_label": "SUR LE PALIER COACHÉ",
  "communities.fig_lane.thread_caption": "une réponse pour tout le monde",
  "communities.fig_lane.tier_caption": "une réponse à chacun",

  "communities.tier.title":
    "Un palier au-dessus de ce que vous vendez déjà. Rien ne bouge en dessous.",
  "communities.tier.body":
    "Même plateforme, même prix d’entrée, mêmes publications, mêmes gens. Au-dessus, vous ouvrez une option de plus : tout ce qu’ils ont déjà, et une ligne à eux dans votre méthode. Ceux qui en veulent montent ; les autres ne s’aperçoivent jamais qu’elle existe.",
  "communities.tier.example":
    "Un exemple chiffré. Cinq cents membres, trois sur dix prennent le palier : 150 × 12 €, moins 150 sièges à 7 €. Environ 750 € par mois, sur des gens dont vous avez déjà payé l’acquisition.",
  "communities.tier.example_caption":
    "Votre prix et votre taux de passage décident de ce total, et ces deux-là sont à vous. Le 7 € n’est pas une estimation, et il ne porte que sur les membres qui montent.",
  "communities.tier.reserve":
    "Aucune intégration Skool, Circle, Discord ou Kajabi — aucune, et vous préférez l’apprendre ici plutôt que le premier jour. Vous continuez d’encaisser vos membres là où vous le faites déjà : le produit ne demande jamais un paiement à un membre. Et les chiffres d’énergie sont éteints par défaut sur son compte.",

  "communities.fig_tier.label": "LA MÊME OFFRE, ET UNE BANDE DE PLUS",
  "communities.fig_tier.alt_title":
    "Le palier se pose au-dessus, l’offre du dessous ne bouge pas",
  "communities.fig_tier.alt_desc":
    "Deux fois la même offre, dessinée par un seul élément appelé deux fois. Celle du dessus porte une bande de plus : une ligne à eux. Rien d’autre ne change.",
  "communities.fig_tier.band": "une ligne à lui, chaque jour",
  "communities.fig_tier.tier_label": "LE PALIER COACHÉ",
  "communities.fig_tier.tier_value": "41 €",
  "communities.fig_tier.base_label": "VOTRE COMMUNAUTÉ",
  "communities.fig_tier.base_value": "29 €",
  "communities.fig_tier.cost_label": "VOTRE COÛT",
  "communities.fig_tier.cost_value": "7 €",

  // ── BANDE 2 · DOULEUR 02 — si un agent répond, plus personne ne se répond ─
  "communities.layer.kicker": "Ce à quoi Sophia ne touche pas",
  "communities.layer.title": "Gardez les pairs. Ajoutez ce qu’un groupe n’allait jamais faire.",
  "communities.layer.body":
    "Vos membres ne se voient jamais entre eux dans Sophia : pas de fil, pas de salon, pas de commentaire. Sophia ne peut pas devenir l’endroit où vos gens se retrouvent, parce qu’il n’y a pas d’endroit de ce genre dans Sophia. Ce qu’un groupe ne sait pas faire, c’est répondre à une personne, à 21 h, sur le dîner qu’elle a devant elle.",
  "communities.layer.figure_caption":
    "C’est l’absence qui fait la garantie : il n’y a nulle part, dans Sophia, où votre communauté pourrait déménager.",

  "communities.fig_layer.label": "LÀ OÙ ILS SE PARLENT, ET LÀ OÙ NON",
  "communities.fig_layer.alt_title": "La communauté au-dessus, une ligne à chacun en dessous",
  "communities.fig_layer.alt_desc":
    "Quatre membres. Au-dessus du trait, chacun est relié à tous les autres : c’est votre communauté, et Sophia n’y touche pas. En dessous, chacun descend dans sa ligne, et rien ne relie une ligne à une autre.",
  "communities.fig_layer.community_label": "VOTRE COMMUNAUTÉ",
  "communities.fig_layer.sophia_label": "DANS SOPHIA",
  "communities.fig_layer.absence": "pas de fil, pas de salon, pas de commentaire",

  // ── BANDE 3 · DOULEUR 03 — un modèle lisse ma voix ───────────────────────
  "communities.voice.kicker": "Votre voix est l’actif",
  "communities.voice.title":
    "Sophia répond avec vos mots. Pas avec les siens, et pas dans un style maison.",
  "communities.voice.body":
    "Vos membres reconnaissent votre écriture au premier coup d’œil, au milieu de n’importe quel contenu santé — et cette reconnaissance est l’essentiel de ce qu’ils paient. Sophia n’a donc pas de personnalité à elle : elle prend la vôtre — vos mots, vos positions, et ce que vous dites à la place de ce que vous ne recommandez pas.",
  // ⚠️ FORMULATION B8b, MOT POUR MOT.
  "communities.voice.lock":
    "Votre méthode entre dans le chat, dans chaque semaine et dans chaque repas que Sophia rédige ; et ce qu’elle écrit dans le chat est relu contre vos lignes rouges avant d’être envoyé — sans modèle dans cette boucle.",
  "communities.voice.close":
    "Votre membre ne reçoit jamais un refus, et jamais un « demandez dans le groupe ».",

  "communities.fig_lock.label": "UN MESSAGE, RELU",
  "communities.fig_lock.alt_title": "Ce qui a été retenu, et ce qui est parti",
  "communities.fig_lock.alt_desc":
    "Trois temps, de haut en bas : la question d’un membre, le brouillon retenu parce qu’il contredit une ligne rouge, et le message réellement envoyé — la phrase que vous avez écrite à la place. Seul le troisième est reçu.",
  "communities.fig_lock.ask_label": "UN MEMBRE DEMANDE",
  "communities.fig_lock.ask_value": "Je peux ajouter une collation entre midi et le dîner ?",
  "communities.fig_lock.draft_label": "LE BROUILLON DISAIT",
  "communities.fig_lock.draft_value": "Une petite collation l’après-midi peut aider.",
  "communities.fig_lock.held": "retenu",
  "communities.fig_lock.sent_label": "CE QUI EST PARTI",
  "communities.fig_lock.sent_value1": "Trois vrais repas. Si tu as faim entre les deux,",
  "communities.fig_lock.sent_value2": "c’est que le repas d’avant était trop petit.",
  "communities.voice.figure_caption":
    "Ce remplacement n’est pas le nôtre. Chaque ligne rouge porte ce que vous dites à la place, dans vos mots, et il part signé de votre nom.",

  // ── BANDE 4 · LE PRIX ET LA CLÔTURE ──────────────────────────────────────
  "communities.pricing.kicker": "Le prix",
  "communities.pricing.title": "Une ligne, et seulement pour les membres qui montent.",
  "communities.pricing.seat_period": "par membre et par mois",
  "communities.pricing.seat_label":
    "Pas de forfait de plateforme. Pas de frais de mise en route. Rien d’autre.",
  "communities.pricing.annual": "6 € pour un siège payé à l’année.",
  "communities.pricing.why":
    "Vous payez les membres que vous avez mis sur le palier coaché, et vous arrêtez de payer le mois où vous éteignez un siège. Le reste de votre communauté ne vous coûte rien, parce qu’il n’est pas là.",
  // À CONSERVER VERBATIM (B31).
  "communities.pricing.no_number":
    "Nous n’avons pas de chiffre de rétention à vous vendre, et nous n’allons pas en inventer un. Le chiffre qui décide de tout ça est le vôtre : ce que vaut, à votre prix, un membre qui reste trois mois de plus.",
  "communities.pricing.trial_note": "14 jours, 3 membres au plus, puis ça s’arrête tout seul.",

  "communities.closing.title":
    "Vous avez déjà les membres, le prix et la méthode. Ce qu’un fil ne peut pas leur donner, c’est une réponse à eux.",
  "communities.closing.cta": "Commencer l’essai de 14 jours",
  "communities.closing.signin_prompt": "Déjà sur Sophia ?",
  "communities.closing.signin_link": "Se connecter",

  // ── /start — LA PORTE D'INSCRIPTION DU FOYER ─────────────────────────────
  //
  // ⚠️ VOUVOIEMENT (2026-08-12). Ce namespace tutoyait, et c'était la couture
  // signalée au lot précédent: `/` vouvoie, `/auth` vouvoie, et le visiteur
  // traverse les trois d'affilée — « Commencer » sur le hall, ou « Créer un
  // compte gratuit » sur l'écran de connexion, atterrissent ICI. Trois surfaces
  // d'un même parcours qui changent d'adresse en deux clics.
  // ⚠️ LE LOT « À PART » A ÉTÉ FAIT LE 2026-09-01: `/meal-prep` et `/app/setup`
  // sont passés au vouvoiement, soixante-quatre clés. Il ne reste `/coaches`,
  // qui s'adresse à un vendeur de méthode — un autre monde, un autre registre.
  "start.seo_title": "Créer votre compte",
  "start.seo_description":
    "Ouvrez votre compte Sophia. Sophia compose la semaine autour des " +
    "personnes qui mangent vraiment à votre table.",
  "start.loading": "Un instant…",

  "start.title": "Créez votre compte.",
  "start.lead":
    "D’abord le compte. Ensuite, vous décrivez qui mange à votre table et ce " +
    "qu’il faut à chacun : c’est autour de ça que Sophia compose la semaine.",

  // ⚠️ `start.price` RETIRÉE LE 2026-09-01. Elle vivait SOUS le bouton
  // d'envoi — un prix qui arrive après la décision qu'il devait éclairer —
  // et elle ne disait rien de la semaine offerte, que `/families` promettait
  // en amont. L'offre est maintenant le bloc partagé `offer`, rendu
  // au-dessus de la fiche par `ui/OfferLines.tsx`.
  "start.coach_line":
    "Un coach vous a invité ? Votre porte est le lien de son e-mail, pas celle-ci.",

  "start.sheet.form": "Inscription",
  "start.sheet.repair": "Rattachement",

  "start.form.name": "Votre nom",
  "start.form.email": "Adresse e-mail",
  "start.form.password": "Mot de passe",
  "start.form.password_hint": "8 caractères au minimum.",
  // ⚠️ CE BLOC A REMPLACÉ LA QUESTION DU PAYS, ET LE REMPLACEMENT EST LA
  // DÉCISION. « Où vous vivez » se justifiait par le numéro d'urgence — un
  // sujet que le produit ne traite pas aujourd'hui — et occupait la place
  // de la seule réponse qui change quelque chose tous les jours. Le pays se
  // déduit désormais du fuseau (`api/countryFromTimezone.ts`).
  "start.form.language":
    "La langue dans laquelle vous voulez qu'on vous parle",
  "start.form.legal_prefix": "J’accepte les",
  // « conditions générales » et pas « conditions d'utilisation »: c'est le nom
  // que porte le même document sur `/auth`. Un document change de nom entre
  // deux portes, et on ne sait plus si c'en est un seul.
  "start.form.legal_terms": "conditions générales",
  "start.form.legal_and": "et la",
  "start.form.legal_privacy": "politique de confidentialité",
  "start.form.cta": "Créer mon compte",
  "start.form.submitting": "Création du compte…",
  "start.form.have_account": "Vous avez déjà un compte ?",
  "start.have_account_cta": "Se connecter",

  "start.repair.title": "Il reste un champ.",
  "start.repair.body":
    "Votre compte existe, mais il n’est pas encore rattaché. Dites-nous où vous " +
    "vivez, et ce sera fait en un clic.",
  "start.repair.cta": "Rattacher mon compte",

  "start.check_email.title": "Confirmez votre adresse.",
  "start.check_email.body":
    "Votre compte est créé et déjà rattaché : l’e-mail ne sert qu’à ouvrir votre " +
    "session. Ouvrez la confirmation qu’on vient de vous envoyer, elle vous " +
    "emmène directement aux trois étapes qui composent votre premier plan.",

  "start.joined.title": "Votre compte est prêt.",
  "start.joined.body":
    "Trois étapes courtes, et votre premier plan est composé. Rien ne se prépare " +
    "en coulisses : vous répondez, et il se construit.",
  "start.joined.cta": "Régler ma cuisine",
  "start.existing.title": "Vous avez déjà un compte.",
  "start.existing.body":
    "Cette adresse est déjà inscrite. Connectez-vous, et on reprend exactement ici.",
  "start.existing.cta": "Se connecter",

  "start.unavailable.title": "L’inscription est en pause.",
  "start.unavailable.body":
    "On ne crée pas de comptes en ce moment : un compte neuf n’aurait rien pour " +
    "fonctionner. Réessayez un peu plus tard — et si un coach vous a invité, " +
    "passez plutôt par le lien de son e-mail.",

  "start.error.legal":
    "Acceptez les conditions générales et la politique de confidentialité pour continuer.",
  "start.error.already_coached":
    "Votre compte suit déjà un coach. Vous n’avez pas besoin de vous inscrire ici.",
  "start.error.caller_is_coach":
    "C’est un compte coach. Votre espace est l’espace coach, pas celui-ci.",
  "start.error.unavailable":
    "L’inscription n’est pas disponible en ce moment. Rien n’a été créé — réessayez plus tard.",
  "start.error.generic": "Ça n’est pas passé. Rien n’a changé — réessayez.",

  // ═══════════════════════════════════════════════════════════════════════════
  // LE COULOIR D'ENTRÉE (lot 2)
  //
  // ⚠️ REGISTRE: TUTOIEMENT, et c'est la suite de l'arbitrage du lot 1. La
  // vitrine vouvoie l'acheteur qu'elle ne connaît pas (`/`, `/pro`, `/auth`,
  // `/start`); le PRODUIT tutoie, comme `/meal-prep`, `/coaches`, la signature
  // du pied de page (« Ta méthode, qui répond en ton absence. ») et Sophia
  // elle-même dans le chat. Tout ce qui suit est derrière la porte.
  //
  // Le raccord `/start` (vous) → `/app/setup` (tu) est VISIBLE et connu. Il
  // appartient au lot qui uniformisera le registre du site, pas à celui-ci —
  // choisir le vouvoiement ici aurait juste déplacé la couture d'un cran, entre
  // le tunnel et le chat.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── LE CHROME DE L'APP CONNECTÉE, CE QUI EN EST TRADUIT (`app.*`) ─────────
  //
  // ⚠️ CE NAMESPACE EST ENTRÉ PAR LA GARDE DE ROUTE, PAS PAR SON CONTENU.
  // `/app/setup` est monté dans `<KeelHouseholdRoute>`, qui rend
  // `app.guard.checking` pendant qu'il résout l'accès — la toute première chose
  // qu'on voit du tunnel d'entrée. Le laisser en anglais faisait lever `t()` en
  // DEV au premier rendu, et aurait affiché « Checking your access… » à un
  // francophone avant même le titre.
  //
  // Les huit libellés d'onglets qui suivent ne sont rendus que par
  // `KeelAppShell`, donc pas encore vus par personne en français — `shell` et
  // `chat` restent en attente et `/app/household` reste anglaise. Ils sont
  // traduits quand même: le namespace est tout-ou-rien par construction, et la
  // moitié qui manque coûterait le même travail dans six mois.
  "app.nav.today": "Aujourd’hui",
  "app.nav.meals": "Idées de repas",
  "app.nav.progress": "Progression",
  "app.nav.chat": "Conversation",
  "app.nav.health": "Santé",
  "app.nav.household": "Foyer",
  // 75 px par colonne sur la barre d'onglets du téléphone: les deux formes
  // courtes doivent tenir sur une ligne, en français comme en anglais.
  "app.nav.plan.short": "Plan",
  "app.nav.meals.short": "Repas",
  "app.nav.plan": "Le plan de ma semaine",
  "app.plan_untitled": "Ton plan",
  "app.guard.checking": "Vérification de ton accès…",
  "app.guard.not_student_title": "Cet espace est réservé aux élèves",
  "app.guard.not_student_body":
    "Ton compte ne suit le plan d’aucun coach. Demande une invitation au tien.",

  // ── L'ÉCRAN « ON NE JOINT PAS LE SERVEUR » ────────────────────────────────
  // ⚠️ VOUVOIEMENT ICI, ET C'EST DÉLIBÉRÉ. Ces quatre phrases ne sont rendues
  // que par `<ServerUnreachable />`, monté par `/start` — une page qui vouvoie —
  // et leur jumelle `auth.error.server_unreachable` dit déjà « Vous êtes bien
  // connecté ». Les tutoyer aurait créé la couture qu'on vient de fermer.
  "server_unreachable.title": "Le serveur ne répond pas.",
  "server_unreachable.body":
    "Votre compte et vos données sont intacts — c’est l’application qui n’arrive à rien lire pour l’instant. En général, ça dure quelques secondes.",
  "server_unreachable.retry": "Réessayer",
  "server_unreachable.after_signin":
    "Vous êtes bien connecté, mais le serveur ne répond pas pour ouvrir votre espace. Réessayez dans un instant.",

  // ── L'INVITATION D'UN COACH (`invite.*`) ──────────────────────────────────
  // Deux lecteurs pour un seul namespace: le COACH qui envoie (la fenêtre
  // d'invitation, la ligne de renvoi de son accueil) et l'ÉLÈVE qui reçoit
  // (`/join`). Les deux sont derrière la porte, les deux sont tutoyés.
  "invite.title": "Inviter un élève",
  "invite.email_label": "E-mail de l’élève",
  "invite.send_button": "Envoyer l’invitation",
  "invite.sent": "Invitation envoyée à {email}",
  // L'invitation EXISTE et son lien marche; c'est l'envoi qui a été supprimé.
  // Le titre dit donc « créée », pas « envoyée » — et surtout pas « échec ».
  "invite.created_not_sent": "Invitation créée pour {email} — mais aucun e-mail n’est parti.",
  "invite.not_sent_delivery_disabled":
    "L’envoi d’e-mails est coupé sur cet environnement (EMAIL_DELIVERY_ENABLED), donc rien n’est parti. L’invitation est bien enregistrée, mais son lien n’a jamais existé ailleurs que dans cet e-mail — plus personne ne peut le récupérer. Rallume l’envoi, puis réinvite cette adresse : ça envoie un lien neuf et annule celui-ci.",
  "invite.not_sent_ephemeral":
    "Ça ressemble à une adresse de test jetable, donc aucun e-mail n’a été envoyé, exprès. L’invitation, elle, est bien réelle.",
  "invite.already_sent":
    "Un lien est parti à {email} il y a quelques instants — rien de neuf n’a été envoyé. Attends une minute si tu en veux un frais.",
  "invite.resend_sent": "Un lien neuf est en route.",
  "invite.resend_already": "Un lien est parti il y a quelques instants — rien de neuf n’a été envoyé.",
  "invite.resend_not_sent": "Aucun e-mail n’est parti : l’envoi est coupé sur cet environnement.",
  "invite.resend_ephemeral": "Adresse de test — aucun e-mail envoyé, exprès.",
  "invite.expired": "Cette invitation a expiré. Demande-en une nouvelle à ton coach.",
  "invite.accept_title": "{coach} t’invite dans son programme de coaching",
  "invite.accept_button": "Accepter l’invitation",
  "invite.existing_account_title": "Tu as déjà un compte",
  "invite.existing_account_body":
    "Cette adresse est déjà enregistrée, il n’y a donc rien à créer. Connecte-toi et l’invitation de ton coach s’applique toute seule — tu n’as pas à revenir sur ce lien.",
  "invite.existing_account_cta": "Se connecter et accepter",
  "invite.already_in_title": "Tu es déjà dedans",
  "invite.already_in_body":
    "Cette invitation a été acceptée et ton coach est relié à ton espace. Rien d’autre à faire ici.",
  "invite.already_in_cta": "Aller dans mon espace",
  // La forme d'OUVERTURE de phrase: « Ton coach t’invite dans son programme ».
  // Le français ajoute un déterminant que l'anglais n'a pas, ce qui est
  // exactement pourquoi cette clé ne peut pas être un `capitalize()` de l'autre.
  "invite.coach_fallback": "Ton coach",
  "invite.dialog.session_expired":
    "Ta session a expiré. Reconnecte-toi pour inviter un élève.",
  "invite.dialog.link_note":
    "Le lien expire dans 14 jours et ne sert qu’une fois. Rien n’existe à son nom tant qu’il n’a pas accepté.",
  // Un exemple d'adresse, donc du texte lu — et pas une vraie adresse.
  "invite.dialog.email_placeholder": "eleve@email.com",
  "invite.dialog.sending": "Envoi en cours…",

  // ══ /join — LA PORTE D'ENTRÉE DE L'ÉLÈVE ═════════════════════════════════
  //
  // La seule page du produit qu'on atteint sans compte et sans session. La
  // personne ne vient PAS de la vitrine: elle vient de l'e-mail de son coach,
  // et elle a déjà un coach. Ce n'est donc pas de la copie d'acquisition —
  // c'est l'accueil de quelqu'un qui a décidé, et qui veut savoir dans quoi il
  // entre.
  //
  // ⚠️ `{coach}` EST TOUJOURS LA FORME DE MILIEU DE PHRASE. L'appelant passe le
  // prénom du coach, ou « ton coach » quand la RPC rend `null`. Aucune clé
  // ci-dessous ne doit ouvrir une phrase sur `{coach}`, sinon le repli sort en
  // minuscule. `invite.accept_title` est le seul usage en ouverture, et il a sa
  // propre forme capitalisée.
  //
  // Le génitif anglais (`{coach}'s method`) devient un complément en français
  // (« la méthode de {coach} »): les clés sont réécrites autour de ça, jamais
  // découpées en fragments que le code recollerait.
  "join.lead":
    "Sophia est l’assistante de {coach}, et à partir d’aujourd’hui elle est aussi la tienne. Elle porte sa méthode — ses convictions, ses lignes rouges, les arbitrages qu’il fait quand ça se complique — et te répond avec, tous les jours, dans ta conversation ici.",
  "join.lead_form_note":
    "Le formulaire est tout en bas. Lis d’abord ceci — c’est ce à quoi tu dis oui.",
  "join.seo_title": "L’invitation de ton coach",
  "join.seo_description":
    "Ce qu’est Sophia, à quoi ressembleront tes journées, et exactement ce que ton coach voit et ne voit pas — avant que tu crées quoi que ce soit.",
  "join.refusal.invalid_token":
    "Ce lien d’invitation n’est pas valable. Vérifie que tu as copié le lien entier depuis l’e-mail, ou demande à ton coach de t’en envoyer un nouveau.",
  "join.refusal.revoked": "Ton coach a annulé cette invitation. Demande-lui-en une nouvelle.",
  "join.refusal.already_accepted":
    "Cette invitation a déjà servi. Si c’était toi, connecte-toi — ton espace t’attend.",
  "join.refusal.coach_unavailable":
    "Le compte de ce coach n’est pas actif en ce moment, l’invitation ne peut donc pas être acceptée.",
  "join.refusal.already_coached":
    "Ton compte suit déjà le programme d’un autre coach. Mets d’abord fin à cette relation depuis la page de ton compte — on ne te fait jamais changer de coach à ta place.",
  "join.refusal.self_invitation": "Cette invitation vient de ton propre compte coach.",
  "join.refusal.preview_unreachable":
    "Impossible de vérifier cette invitation pour le moment. Recharge la page pour réessayer.",
  "join.refusal.accept_failed":
    "Ça n’est pas passé. Rien n’a changé — recharge et réessaie.",
  "join.state.checking": "Vérification de l’invitation…",
  "join.state.joining": "On te rattache…",
  "join.check_email.title": "Confirme ton adresse e-mail",
  "join.check_email.body":
    "Ton compte est créé et tu es déjà rattaché au programme de {coach}. Ouvre l’e-mail de confirmation qu’on vient de t’envoyer pour finir de te connecter.",
  // La forme de MILIEU de phrase, sans capitale: « le programme de ton coach ».
  "join.coach_fallback": "ton coach",
  "join.refused.title": "Cette invitation ne peut pas servir",
  "join.refused.signin_cta": "Me connecter à un compte existant",
  "join.accepted.title": "Tu es dedans.",
  "join.accepted.title_with_coach": "Tu es dedans, avec {coach}.",
  "join.accepted.body":
    "Ton espace est ouvert. Sophia t’attend dans ta conversation, et ta semaine vit ici aussi.",
  "join.accepted.cta": "Parler à Sophia",

  // Ce à quoi les journées ressemblent VRAIMENT. Le surtitre nomme la SURFACE,
  // parce que « sur quel écran ça se passe » est le fait utile.
  "join.day.title": "Concrètement, ça donne quoi",
  "join.day.where_chat": "Dans ta conversation",
  "join.day.where_app": "Dans cette application",
  "join.day.photo_title": "Tu envoies une photo de ton assiette, quand tu veux.",
  "join.day.photo_body":
    "Une photo, aucun formulaire à remplir et rien à poser sur une balance pour ça. Ce qui revient est une réponse dans la méthode de {coach} — ce que l’assiette fait bien, ce qui lui manque, avec ses mots à lui plutôt qu’avec ceux d’une étiquette nutritionnelle.",
  "join.day.evening_title": "Le soir, une question et un geste.",
  "join.day.evening_body":
    "Bonne journée, moyenne, ou dure. Si ce n’était pas une bonne journée, un geste de plus dit si c’était l’énergie, la faim ou le sommeil. C’est tout, et tu peux laisser tomber les jours où tu n’en as pas envie.",
  "join.day.app_title": "Ta semaine, et comment elle se passe.",
  "join.day.app_body":
    "Sophia ébauche une semaine à partir de la méthode de {coach} et de ce que ta vie permet vraiment, et elle n’est pas la tienne tant que tu ne l’as pas dit. À côté : les jours que tu as notés, comment les soirs se sont passés, à quoi ressemblaient tes assiettes.",
  "join.day.tap_good": "Ça va",
  "join.day.tap_mixed": "Moyen",
  "join.day.tap_hard": "Dur",

  // Le bloc sombre. La vitrine dépense son unique fond sombre sur la garantie
  // qui intéresse un coach; cette page-ci la dépense sur celle qui intéresse un
  // élève.
  "join.grade.kicker": "Ce qui change vraiment",
  "join.grade.title": "Compté, jamais noté",
  "join.grade.lead":
    "Des choses sont bien comptées ici — les jours que tu as notés, les assiettes que tu as photographiées, ce qui est apparu dessus. La différence est dans la suite : rien de tout ça ne devient une note à courir après, et une semaine difficile ne se transforme jamais en chiffre que tu devrais rattraper.",
  "join.grade.one_title": "Aucun score, aucune série, aucun pourcentage sur tes écrans.",
  "join.grade.one_body":
    "Des comptes existent, et tu peux les lire dans ton espace — mais aucun ne court contre toi. Un jour que tu sautes ne casse rien, parce qu’il n’y a aucune série à casser et aucun total à gâcher.",
  "join.grade.two_title": "Une photo ne devient jamais un chiffre.",
  "join.grade.two_body":
    "Jamais depuis une photo — rien n’est lu sur ton assiette comme une calorie ou un macro, ni stocké, ni transmis. On a mesuré pourquoi avant de trancher : sur 85 analyses réelles, une estimation de calories à partir d’une photo tombait en moyenne 26,6 % sous la vérité, et la marge d’erreur annoncée par le modèle contenait la vérité à peine plus d’une fois sur deux. Là où un chiffre existe dans ce produit, il est calculé à partir de quantités que quelqu’un a réellement données — jamais à partir d’une image.",
  "join.grade.three_title": "Un jour que tu ne notes pas n’est pas un jour raté.",
  "join.grade.three_body":
    "Le silence est enregistré comme inconnu, et l’inconnu n’est jamais transformé en échec dans ton dos. C’est la seule chose que ce produit refuse de deviner à ton sujet.",

  // Le bloc qui liste. On donne la liste réelle, pas une phrase rassurante.
  "join.seen.kicker": "Avant même ta première photo",
  "join.seen.title": "Ce que {coach} voit, et ce qu’il ne voit pas",
  "join.seen.lead":
    "Tu vas commencer à montrer ce que tu manges à un logiciel. Tu mérites la liste exacte, pas une formule rassurante. La voici.",
  "join.seen.sees_label": "Ce qui passe de l’autre côté",
  "join.seen.never_label": "Ce qui reste chez toi",
  "join.seen.sees_1": "Ton nom, et le fuseau horaire où tu vis.",
  "join.seen.sees_2": "La dernière fois que tu as écrit, et combien de fois dans la semaine écoulée.",
  "join.seen.sees_3":
    "Ce que tu as noté et quand — y compris les groupes d’aliments lus sur une assiette, et le fait qu’une photo l’accompagnait ou non.",
  "join.seen.sees_4":
    "Comment la semaine s’est passée : combien de jours bons, moyens ou durs, et lequel de l’énergie, de la faim ou du sommeil revient le plus quand ça ne va pas.",
  "join.seen.sees_5":
    "Chaque fois qu’il ouvre ton espace. C’est écrit noir sur blanc, et ça te revient si tu demandes tes données.",
  "join.seen.never_1":
    "Ce que tu écris. Sa fenêtre sur ta conversation a deux colonnes : quand tu as écrit pour la dernière fois, et à quelle fréquence. Il n’existe aucune colonne qui contienne les mots.",
  "join.seen.never_2":
    "Tes photos. Elles arrivent à Sophia et s’arrêtent là. Ce que la vue de ton coach porte, c’est qu’une photo a existé, jamais la photo.",
  "join.seen.never_3": "Tout ce que tu ajoutes avec tes propres mots à côté d’un repas.",
  // ⟳ RE-RÉÉCRITE LE 2026-09-01 — voir le pack EN pour le pourquoi en entier.
  // « Ton coach n’en voit jamais » était faux: `CoachStudentPage` rend
  // « Maintenance ≈ {low}–{high} kcal/day » dès la première pesée. Ce qui est
  // vrai se dit en entier — rien de ce que l’élève MANGE ne traverse, et la
  // fourchette que le coach voit sort de la pesée seule.
  "join.seen.never_4":
    "Un nombre de calories lu sur ce que tu manges. Rien de ce que tu manges ne devient un chiffre de son côté, et une photo n’en produit jamais. Ce qu’il voit, c’est une fourchette d’entretien calculée à partir de ta seule pesée — la fourchette dans laquelle il travaillerait, jamais une lecture de tes assiettes.",
  "join.seen.exception_label": "Une exception, et elle est voulue",
  "join.seen.exception_body":
    "Si ce que tu écris laisse penser que ton rapport à la nourriture se retourne contre toi, cette phrase part chez {coach} le jour même, marquée urgente. Un logiciel ne devrait pas être seul à porter ça.",
  "join.limit.title": "Il n’y a pas de ligne directe vers {coach}",
  "join.limit.body":
    "Ce n’est pas une messagerie avec ton coach au bout du fil. Il enseigne une méthode à tous ceux qu’il coache, et Sophia est la façon dont elle t’atteint au quotidien. Ce que tu partages nourrit le tableau hebdomadaire qu’il lit — ce n’est pas un message qui attend sa réponse.",

  "join.form.title": "Crée ton espace",
  "join.form.lead": "Tu es relié à {coach} dès que tu as fini.",
  "join.form.name": "Ton nom",
  "join.form.language":
    "La langue dans laquelle tu veux qu'on te parle",
  "join.form.language_hint":
    "Ton coach te répond dans cette langue, et écrit ton plan dedans. Tu pourras en changer plus tard.",
  "join.form.email": "E-mail",
  "join.form.password": "Mot de passe",
  "join.form.password_hint": "8 caractères minimum.",
  "join.form.submitting": "Création de ton espace…",
  "join.form.have_account": "Tu as déjà un compte ?",
  "join.form.have_account_cta": "Se connecter et accepter depuis là",
  "join.form.signed_in_as": "Connecté en tant que {email}.",
  "join.form.signed_in_body":
    "Accepter ouvre à {coach} exactement la fenêtre décrite plus haut, et rien de plus large. Il lit ; il ne peut jamais agir à ta place. Tu peux y mettre fin depuis la page de ton compte quand tu veux.",
  "join.no_token.title": "Il te faut le lien de ton coach",
  "join.no_token.body":
    "On ne s’inscrit pas ici. Un espace ne se crée jamais qu’à partir d’une invitation que ton coach t’envoie, avec ton adresse dessus. Demande-la-lui, et ouvre-la sur ton téléphone.",
  "join.no_token.have_account": "Tu as déjà un compte ?",
  "join.no_token.have_account_cta": "Se connecter",
  "join.no_token.what_is_this": "Ce dans quoi tu entrerais",

  // ══ /join-household — RÉCLAMER SA PLACE DANS UN FOYER ════════════════════
  //
  // La personne qui ouvre ce lien n'a le plus souvent aucun compte: quelqu'un
  // a déjà posé sa ligne (son prénom, ses allergies, ce que la maison ne sert
  // pas), et réclamer y rattache son compte. Rien n'est créé, rien n'est perdu.
  //
  // ⚠️ LE MOT « RÉCLAMER » A ÉTÉ GARDÉ, ET C'ÉTAIT UN ARBITRAGE. « Récupérer »
  // sonne comme reprendre quelque chose qu'on avait; « rejoindre » efface le
  // fait que la ligne EXISTE DÉJÀ, avec des allergies dessus, ce qui est
  // précisément ce que l'écran doit faire comprendre.
  "household_claim.seo_title": "Réclame ta place — Sophia",
  "household_claim.seo_description":
    "Rattache ton compte à la ligne que quelqu’un a déjà posée pour toi dans son foyer.",
  "household_claim.checking": "Vérification du lien…",
  "household_claim.title": "La place de {name} dans {household}",
  "household_claim.lead":
    "Quelqu’un a déjà posé cette ligne : le prénom de {name}, ses allergies, et ce que la maison ne sert pas. La réclamer y rattache ton compte — ça n’en crée pas une seconde, et rien de ce qui s’y trouve n’est perdu.",
  "household_claim.gains_label": "Ce que la réclamer te donne",
  "household_claim.gains_1": "Tu vois ce que le foyer cuisine, et ta propre part.",
  "household_claim.gains_2":
    "Tu poses ta direction — perdre de la masse grasse, prendre du muscle, ou aucune — et ta part la suit.",
  "household_claim.gains_3": "Ton prénom, tes allergies et ta ligne restent les tiens.",
  "household_claim.limits_label": "Ce que ça ne te donne pas",
  "household_claim.limits_1":
    "Tu ne composes pas le plan, et tu n’ajoutes ni ne retires personne. Une seule personne tient le menu.",
  "household_claim.limits_2":
    "Tu ne décides pas ce que la maison ne sert pas — et qui le décide est écrit à l’écran, jamais caché.",
  "household_claim.signed_in_as": "Tu es connecté en tant que {email}.",
  "household_claim.submit": "Réclamer cette place",
  "household_claim.working": "Réclamation en cours…",
  "household_claim.signed_out.body":
    "Cette invitation a été envoyée à {email}. Connecte-toi avec cette adresse pour la réclamer — le compte doit correspondre.",
  "household_claim.signed_out.cta": "Se connecter et réclamer",
  "household_claim.signed_out.or": "Pas encore de compte sur cette adresse ?",
  "household_claim.signup.cta": "Créer mon compte",
  "household_claim.signup.title": "Créer le compte de {email}",
  "household_claim.signup.lead":
    "Cette adresse est celle à qui l’invitation a été envoyée, et la seule qui puisse réclamer cette place. Ton compte est à toi — le foyer ne lit pas ton mot de passe, et tu peux partir quand tu veux.",
  "household_claim.signup.email_label": "Adresse e-mail",
  "household_claim.signup.email_hint":
    "Fixée par l’invitation. Réclamer avec une autre adresse est refusé.",
  "household_claim.signup.name_label": "Ton nom",
  "household_claim.signup.language_label":
    "La langue dans laquelle tu veux qu'on te parle",
  "household_claim.signup.language_hint":
    "Ton coach te répond dans cette langue, et écrit ton plan dedans. Tu pourras en changer plus tard.",
  "household_claim.signup.name_hint":
    "Sur ton compte. Le prénom posé sur la ligne du foyer, lui, ne bouge pas.",
  "household_claim.signup.password_label": "Mot de passe",
  "household_claim.signup.password_hint": "8 caractères minimum.",
  // Les quatre fragments de la ligne légale, recollés par le JSX autour de deux
  // liens. L'ordre français est le même que l'anglais, ce qui est un coup de
  // chance et pas une règle: si une langue le changeait, il faudrait une clé
  // unique avec ses ancres, pas quatre morceaux.
  "household_claim.signup.legal_prefix": "J’accepte les",
  "household_claim.signup.legal_terms": "Conditions générales",
  "household_claim.signup.legal_and": "et la",
  "household_claim.signup.legal_privacy": "Politique de confidentialité",
  "household_claim.signup.submit": "Créer mon compte et réclamer",
  "household_claim.signup.submitting": "Création de ton compte…",
  "household_claim.signup.error.legal":
    "Accepte les Conditions générales et la Politique de confidentialité pour continuer.",
  "household_claim.signup.error.existing":
    "Il existe déjà un compte sur cette adresse. Connecte-toi plutôt — ta place t’attend.",
  "household_claim.signup.closed":
    "La création de compte est fermée pour le moment (avant-lancement). Si tu en as déjà un, connecte-toi ci-dessus.",
  "household_claim.signup.check_email.title": "Confirme ton adresse e-mail",
  "household_claim.signup.check_email.body":
    "Ton compte est créé. Clique sur le lien qu’on vient d’envoyer à {email}, puis rouvre ton lien d’invitation — réclamer ta place demande une adresse confirmée.",
  "household_claim.no_token.title": "Ce lien est incomplet",
  "household_claim.no_token.body":
    "L’adresse n’a pas son code d’invitation. Ouvre le lien qu’on t’a envoyé en entier, ou demandes-en un nouveau.",
  "household_claim.refused.title": "Ce lien ne peut pas servir",
  "household_claim.refused.generic":
    "Impossible d’utiliser cette invitation. Demandes-en une nouvelle.",
  "household_claim.refused.unknown_token":
    "On ne reconnaît pas cette invitation. Vérifie que tu as copié le lien entier, ou demandes-en un nouveau.",
  "household_claim.refused.expired": "Cette invitation a expiré. Demandes-en une nouvelle.",
  "household_claim.refused.already_used":
    "Cette invitation a déjà servi. Si c’était toi, connecte-toi — ta place t’attend.",
  "household_claim.refused.already_claimed":
    "Cette ligne a déjà un compte dessus. Si c’est le tien, connecte-toi.",
  "household_claim.refused.email_mismatch":
    "Cette invitation a été envoyée à une autre adresse. Connecte-toi avec celle qui l’a reçue.",
  "household_claim.refused.already_in_household":
    "Ton compte est déjà dans un foyer, et un compte n’appartient qu’à un foyer à la fois.",
  "household_claim.refused.country_required":
    "Ton compte ne dit pas dans quel pays tu vis, et une place dans un foyer ne se réclame pas sans ça — c’est lui qui décide de la ligne d’écoute qu’on te donne.",
  "household_claim.refused.bad_country":
    "Ce code pays n’a pas été compris. Choisis-en un dans la liste.",
  "household_claim.refused.not_authenticated":
    "Ta session s’est terminée avant qu’on ait fini. Reconnecte-toi et rouvre le lien.",
  "household_claim.refused.unreachable":
    "Le serveur ne répond pas. L’invitation, elle, va bien — recharge la page et réessaie.",
  "household_claim.refused.ask_again":
    "La personne qui tient ce foyer peut renvoyer un lien en quelques secondes.",
  "household_claim.done.title": "Tu es dans {household}",
  "household_claim.done.body":
    "Ton compte est rattaché à la ligne qui avait déjà été posée pour toi. Pose ta direction quand tu veux — elle change ta part, pas celle des autres.",
  "household_claim.done.cta": "Ouvrir le foyer",
  "household_claim.home_link": "Retour à l’accueil",

  // ══ LE FOYER (`household.*`) ═════════════════════════════════════════════
  //
  // ⚠️ CE NAMESPACE ENTRE DANS LE PÉRIMÈTRE PAR UN EMPRUNT DE CINQ CLÉS.
  // `SetupPage.tsx` appelle `household.invite.error.bad_email`,
  // `household.invite.link_ready`, `household.me.unlock`,
  // `household.member.birth_date_kept` et `household.member.save`. La frontière
  // étant à la maille du namespace, l'onboarding tire les 178 clés avec lui.
  //
  // Sa page principale, `/app/household`, reste ANGLAISE malgré ça: elle monte
  // `KeelAppShell`, dont les trois namespaces ne sont pas traduits. Ce n'est pas
  // du travail perdu — c'est la moitié d'un écran, prête pour le lot qui prendra
  // le shell.
  //
  // ── LE VOCABULAIRE, ET LES MOTS QU'ON N'EMPLOIE PAS ──────────────────────
  // « part » et jamais « portion » pour ce que quelqu'un reçoit dans l'assiette:
  // « portion » est le mot de l'unité de mesure (`serving`), et le produit tient
  // les deux séparés. « direction » et jamais « objectif »: un objectif se rate,
  // une direction se suit — c'est tout le propos de « personne ne te note ».
  "household.title": "Ton foyer",
  "household.empty.title": "Cuisiner une fois, pour tout le monde",
  "household.empty.body":
    "Ajoute les personnes pour qui tu cuisines. Une seule session de cuisine, et des parts qui suivent la direction de chacun.",
  "household.create.name": "Tu l’appelles comment ?",
  "household.create.submit": "Créer le foyer",
  "household.members.title": "Qui mange ici",
  "household.members.owner": "Tient le foyer",
  "household.members.child": "Enfant",
  "household.me.title": "Toi aussi, tu manges ici",
  "household.me.body":
    "Commence par toi : ce sont les trois mêmes choses que tu rempliras pour les autres.",
  "household.me.unlock":
    "Ta direction est aussi ce qui nous permet de composer pour le foyer. Une minute maintenant, et le plan est disponible.",
  "household.me.sheet":
    "Les six mêmes questions que pour les autres — ton corps et ce que tu manges déjà sont ce qui dimensionne ta part.",
  "household.me.open": "Compléter ma fiche",
  "household.member.first_name": "Prénom",
  "household.member.first_name_hint": "C’est ainsi que le plan nommera sa part.",
  "household.member.birth_date": "Date de naissance",
  "household.member.birth_date_hint":
    "Facultatif. Tant qu’on ne l’a pas, cette personne reçoit une part standard — une direction ne s’applique qu’à un âge connu.",
  "household.member.birth_date_kept":
    "Déjà enregistrée. Laisse ce champ vide pour la garder, ou choisis une nouvelle date pour la remplacer.",
  "household.member.birth_date_mine":
    "La même date que dans ton À propos de toi — la remplir ici la remplit là-bas. Facultatif, et tant qu’on ne l’a pas tu reçois une part standard : une direction ne s’applique qu’à un âge connu.",
  "household.member.goal": "Sa direction",
  "household.member.goal_mine": "Ta direction",
  "household.member.goal_none": "Aucune direction particulière",
  "household.member.goal_inactive":
    "Enregistrée, et pas encore appliquée : une direction a besoin d’un âge. Ajoute sa date de naissance au-dessus.",
  "household.member.goal_from_profile":
    "Posée dans son propre profil, sous À propos de toi — elle la suit partout, pas seulement à cette table.",
  "household.member.save": "Enregistrer",
  "household.member.saved": "Enregistré.",
  "household.member.edit": "Modifier",
  "household.member.close": "Fermer",
  "household.member.remove": "Retirer du foyer",
  "household.member.detach": "Retirer son accès",
  "household.member.detach_hint":
    "Retirer son accès la déconnecte de ce foyer — elle reste à table, avec sa part et ses allergies. La retirer du foyer efface tout.",
  "household.member.remove_hint":
    "Ça efface sa part, ses allergies et ce que cette maison ne lui sert pas.",
  "household.away.title": "Quand elle mange ailleurs",
  "household.away.hint":
    "Décoche les repas qu’elle ne prendra pas ici. Rien n’est annulé pour les autres — on cuisine simplement pour une personne de moins ce jour-là.",
  "household.away.open": "Indiquer ses absences",
  "household.away.open_count": "Absente sur {n} repas — modifier",
  "household.away.self_declared": "Elle nous l’a déjà signalé elle-même : {days}.",
  // Les six directions, en libellé. Forme nominale pour toutes: ce sont des
  // étiquettes dans une liste déroulante, pas des phrases.
  "household.goal.fat_loss": "Perte de masse grasse",
  "household.goal.muscle_gain": "Prise de muscle",
  "household.goal.recomposition": "Recomposition corporelle",
  "household.goal.performance": "Performance sportive",
  "household.goal.health": "Santé",
  "household.goal.maintenance": "Maintien",
  "household.add.title": "Ajouter quelqu’un qui mange ici",
  "household.add.body":
    "Pas de compte, pas d’invitation, personne à attendre. Un prénom suffit pour commencer.",
  "household.add.submit": "L’ajouter",
  "household.add.full":
    "Huit, c’est le maximum d’un foyer. Chaque bouche est une part de plus à composer à chaque génération.",
  "household.habits.title": "Ce qu’elle mange d’habitude",
  "household.habits.hint":
    "Certaines personnes prennent toujours la même chose à un moment donné, quoi que la maison cuisine. Le dire garde ce plat hors de leur assiette — et garde leur habitude sur la liste de courses.",
  "household.habits.open": "Renseigner ses habitudes",
  "household.habits.close": "Fermer",
  "household.habits.loading": "Lecture de ses habitudes…",
  "household.habits.choice_household_dish": "Elle mange ce que la maison cuisine",
  "household.habits.choice_own_usual": "Elle a son habitude à elle",
  "household.habits.usual_label": "Ce qu’elle prend",
  "household.habits.usual_placeholder": "une pomme",
  "household.habits.usual_missing": "Dis en quelques mots ce que c’est.",
  "household.habits.note_label": "Autre chose à savoir",
  "household.habits.note_hint":
    "Une ligne, gardée pour de bon, relue à chaque fois qu’on cuisine. Goûts, textures, ce à quoi elle ne touche jamais.",
  "household.habits.note_placeholder": "Ne mange rien de réchauffé.",
  "household.habits.no_slots": "Aucun moment de repas n’est encore posé pour cette personne.",
  "household.habits.save": "Enregistrer",
  "household.habits.saved": "Enregistré.",
  "household.body.title": "Quelle part lui servir",
  "household.body.hint":
    "Une paume de poulet n’est pas la même paume chez un enfant de six ans et chez un adulte. On s’en sert pour calculer quelle quantité du même plat va dans chaque assiette — rien d’autre. Ce n’est jamais affiché à table, jamais dit à voix haute, et jamais transformé en objectif.",
  "household.body.height": "Taille (cm)",
  "household.body.weight": "Poids (kg)",
  "household.body.gender": "Sexe",
  "household.body.gender_female": "Femme",
  "household.body.gender_male": "Homme",
  "household.body.gender_other": "Autre",
  "household.body.save": "Enregistrer",
  "household.body.saved": "Enregistré.",
  "household.body.missing":
    "On ne l’a pas encore — d’ici là, cette personne reçoit une part standard de ce que la maison cuisine.",
  "household.body.needs_birth_date":
    "Ajoute aussi sa date de naissance au-dessus : ce dont un enfant en croissance a besoin ne se calcule pas comme pour un adulte.",
  "household.error.body_incomplete":
    "Il nous faut les trois — taille, poids et sexe. Deux sur trois ne permettent pas de dimensionner une assiette.",
  "household.error.bad_height": "Cette taille n’est pas exploitable.",
  "household.error.bad_weight": "Ce poids n’est pas exploitable.",
  "household.error.bad_gender": "Ce n’est pas une des options.",
  // L5-B (2026-08-18). Voir la note du pack anglais.
  "household.error.bad_day_activity":
    "Cette réponse sur la journée ne fait pas partie de celles qu'on connaît. Choisis parmi les trois.",
  "household.error.bad_sport_frequency":
    "Cette réponse sur le sport ne fait pas partie de celles qu'on connaît. Choisis parmi les quatre.",
  "household.error.bad_appetite":
    "Cette réponse sur l'appétit ne fait pas partie de celles qu'on connaît. Choisis parmi les trois.",
  "household.error.bad_weekday": "Ce n'est pas un jour de la semaine.",
  "household.error.bad_slot": "Ce n'est pas un repas sur lequel on peut poser une habitude.",
  "household.error.empty_label":
    "Dis-nous ce que c'est, dans tes mots — un libellé vide correspondrait à n'importe quel plat.",
  "household.error.label_too_long": "Soixante caractères au maximum.",
  "household.error.too_many_traditions":
    "Trois jours fixes, c'est le maximum. Retires-en un pour en ajouter un autre.",
  "household.error.bad_activity_level":
    "Ce n’est pas une des quatre réponses proposées.",
  // ⚠️ REMPLACÉES PAR `plan.reference.*`, gardées le temps que leur lecteur
  // bouge — retirer une clé avant son lecteur ne compile pas.
  "household.reference.title": "Quelle façon de manger le plat commun suit",
  "household.reference.hint":
    "Quand deux adultes suivent ici des méthodes différentes, le plat commun ne peut en suivre qu’une. Choisis laquelle. Ça change ce qu’on cuisine, jamais la quantité que chacun reçoit — les parts sont calculées personne par personne dans les deux cas.",
  "household.reference.default": "Celle de la personne qui compose cette semaine-là",
  "household.reference.saved": "Enregistré.",
  "household.error.minor_cannot_be_reference":
    "Le plat commun suit la méthode d’un adulte, pas celle d’un enfant.",
  "household.error.age_unknown_cannot_be_reference":
    "Ajoute d’abord sa date de naissance — sans elle, on ne sait pas s’il s’agit d’un adulte.",
  "household.error.not_your_household": "Ce n’est pas ton foyer.",
  "household.error.bad_first_name": "Un prénom fait entre 1 et 40 caractères.",
  "household.error.bad_birth_date": "Cette date est dans le futur.",
  "household.error.bad_goal": "Cette direction ne fait pas partie de celles qu’on connaît.",
  "household.error.bad_label": "C’est vide, ou trop long (120 caractères).",
  "household.error.bad_away": "On n’a pas su lire ces jours.",
  "household.error.bad_work_lunch": "On n’a pas su lire cette réponse.",
  "household.error.not_adult":
    "Cette question ne se pose qu’aux majeurs, et c’est la date de naissance " +
    "qui le dit. Renseignez-la au-dessus, et elle pourra être répondue.",
  "household.error.too_many_away":
    "Il y a déjà trop de jours marqués pour cette personne. Libérez-en " +
    "quelques-uns dans la grille d’abord.",
  "household.error.bad_slots":
    "On n’a pas su lire ces habitudes. Chaque moment marqué « son habitude à elle » demande quelques mots.",
  "household.error.bad_note": "Cette note est vide, ou trop longue (280 caractères).",
  "household.error.household_full":
    "Huit, c’est le maximum d’un foyer. Retire d’abord quelqu’un.",
  "household.error.not_owner": "Seule la personne qui tient le foyer peut faire ça.",
  "household.error.not_a_member": "Cette personne n’est pas dans ton foyer.",
  "household.error.not_your_line": "Tu ne peux modifier que ta propre ligne.",
  "household.error.no_household": "Tu n’es dans aucun foyer.",
  "household.error.cannot_remove_owner":
    "La personne qui tient le foyer ne peut pas en être retirée.",
  "household.error.cannot_detach_owner":
    "La personne qui tient le foyer ne peut pas perdre son accès — plus personne ne pourrait composer un repas.",
  "household.error.not_claimed":
    "Cette personne n’a pas de compte ici, il n’y a donc aucun accès à retirer.",
  "household.error.not_found": "C’est déjà parti.",
  "household.constraint.kind": "C’est quoi ?",
  "household.constraint.kind.allergy": "Une allergie",
  "household.constraint.kind.allergy_hint":
    "Médical. Ça vaut pour toute la casserole, pour tout le monde à table, et rien ne se cuisine sans en tenir compte.",
  "household.constraint.kind.house_rule": "Quelque chose que cette maison ne sert pas",
  "household.constraint.kind.house_rule_hint":
    "C’est ta décision de foyer. On la tient, et on ne la déguise jamais en conseil de santé.",
  "household.allergy.placeholder": "Arachides",
  "household.allergy.add": "Ajouter l’allergie",
  "household.allergy.remove": "Retirer",
  "household.invite.title": "Laisser quelqu’un réclamer son profil",
  "household.invite.body":
    "Ses parts, ses allergies et ce que cette maison ne sert pas sont déjà sur sa ligne. La réclamer rattache son compte à cette même ligne — rien n’est créé, rien n’est perdu.",
  "household.invite.grants":
    "Ce que ça lui donne : elle voit le plan du foyer et pose sa propre direction. Pas : composer, ajouter ou retirer quelqu’un, ni décider ce que la maison ne sert pas.",
  "household.invite.who": "C’est pour qui ?",
  "household.invite.who_hint":
    "Seules les personnes qui n’ont pas encore de compte sont listées. Le lien réclame cette ligne-là, exactement.",
  "household.invite.nobody_left":
    "Tout le monde ici a déjà un compte. Ajoute d’abord quelqu’un, puis invite-le.",
  "household.invite.email": "Son e-mail",
  "household.invite.submit": "Créer l’invitation",
  "household.invite.link_ready":
    "Envoie ce lien pour réclamer le profil de {name}. Il sert une fois, pour cette adresse, et expire dans 14 jours.",
  "household.invite.error.rate_limited": "Ça fait assez d’invitations pour aujourd’hui.",
  "household.invite.error.bad_email": "Cette adresse n’a pas l’air utilisable.",
  "household.invite.error.not_owner": "Seule la personne qui tient le foyer peut inviter.",
  "household.invite.error.already_claimed":
    "Cette ligne a déjà un compte dessus. Il n’y a rien à réclamer.",
  "household.restriction.title": "Les aliments que ce foyer ne sert pas",
  "household.restriction.add": "L’ajouter",
  "household.restriction.placeholder": "Nutella",
  "household.restriction.notice_owner": "Pas servi ici — {owner} en a décidé ainsi.",
  "household.restriction.notice_me": "C’est toi qui en as décidé ainsi.",
  "household.restriction.remove": "Retirer",
  // ⚠️ `household.envy.*` part sous `plan.envy.*` (sans `save`: l'envie n'a plus
  // de bouton propre, elle part avec le formulaire de demande).
  // `household.compose.*` est SUPPRIMÉE — la demande complète est sur
  // `/app/plan`. `household.portions.*` part sous `plan.table.*`. Les dix clés
  // sont gardées le temps que leurs lecteurs bougent.
  "household.envy.title": "La maison a envie de quoi cette semaine ?",
  "household.envy.body":
    "Une ligne, pour tout le monde. Écris-la avant que le plan soit fait — personne d’autre n’a rien à remplir, et la laisser vide ne pose aucun problème.",
  "household.envy.placeholder": "Léa veut des pâtes, Marc en a marre du poulet.",
  "household.envy.save": "Enregistrer",
  "household.compose.title": "Faire le plan de la semaine",
  "household.compose.body":
    "Une session de cuisine, des parts qui suivent la direction de chacun, et les courses réparties selon ce qui doit rester frais.",
  "household.compose.submit": "Composer pour le foyer",
  "household.compose.working": "Composition en cours…",
  "household.portions.title": "À table",
  "household.portions.standard": "Une part standard",
  "household.paused.title": "Ton foyer est en pause",
  "household.paused.body":
    "Aucune nouvelle semaine n’est composée en ce moment. Tout le reste fonctionne — ton plan en cours, cette page, et la conversation.",
  "household.paused.kept":
    "Rien n’a été effacé. Les personnes d’ici, leurs âges, leurs allergies et leurs directions sont exactement où tu les as laissés, et ils reviennent tels quels.",
  "household.paused.resume_cta": "Le relancer",
  "household.paused.working": "Ouverture…",
  "household.paused.owner_only":
    "La personne qui a créé ce foyer peut le relancer depuis son propre compte.",
  // ⚠️ CES QUATRE CLÉS N'ONT AUCUN APPELANT DANS LE DÉPÔT (vérifié par grep sur
  // tout `frontend/src`). Elles sont traduites parce que la parité l'exige — le
  // pack porte EXACTEMENT les clés du périmètre — et signalées ici parce que la
  // bonne suite est de les retirer de `en.ts`, pas de les garder. Le retrait
  // appartient au chantier foyer, qui est ouvert dans une autre session.
  "household.waves.title": "Courses",
  "household.waves.now": "À acheter maintenant",
  "household.waves.on": "À acheter le {date}",
  "household.waves.reason": "pour la cuisine du {day}",
  "household.merge.title": "Quelqu’un cuisine de son côté",
  "household.merge.body":
    "Cette personne s’est construit un plan à elle et l’a validé. Tu peux le replier dans le plan du foyer, ou le laisser — dans tous les cas, elle garde son plan.",
  "household.merge.none":
    "Personne dans le foyer ne cuisine de son côté en ce moment. Tout le monde mange le plan du foyer.",
  "household.merge.merge_cta": "Replier son plan dedans",
  "household.merge.unmerge_cta": "Reconstruire sans elle",
  "household.merge.dismiss_cta": "Laisser comme ça",
  "household.merge.working": "En cours…",
  "household.merge.revalidated_title": "Un plan replié a évolué depuis",
  "household.merge.revalidated_body":
    "Le plan du foyer cuisine toujours ce qui avait été validé au moment où tu l’as replié. Cette personne en a validé un plus récent depuis.",
  "household.merge.window": "Jours qui seraient repris : {days}, à partir du {from}.",
  "household.merge.window_past": "{days} de ses jours sont déjà derrière nous.",
  "household.merge.window_rebuilt":
    "Les {days} jours restants du foyer sont reconstruits, pour que la fin de semaine garde un plan.",
  "household.merge.unmerge_window": "Reconstruire referait {days} jour(s) à partir du {from}.",
  "household.merge.quota_left": "Il reste {remaining} fusions sur {limit} cette semaine.",
  "household.merge.quota_none":
    "Ce foyer a utilisé ses {limit} fusions de la semaine. Rien n’est perdu — ça repart le {date}.",
  "household.merge.mute": "Ne plus me proposer de fusionner son plan",
  "household.merge.mute_hint":
    "Son plan existe toujours et tu peux le replier quand tu veux. C’est seulement la question qu’on arrête de te poser.",
  "household.merge.unmute": "Reproposer son plan",
  "household.merge.muted": "On ne te pose plus la question pour son plan.",
  "household.merge.skipped_title": "Non proposés",
  "household.merge.skip.member_is_owner": "Le plan de ce foyer est déjà le tien.",
  "household.merge.skip.no_validated_plan": "Cette personne n’a validé aucun plan à elle.",
  "household.merge.skip.proposals_muted": "Tu as demandé qu’on ne te la propose plus.",
  "household.merge.skip.dismissed_by_owner":
    "Tu as laissé passer celle-là. Si elle valide un autre plan, la question revient.",
  "household.merge.skip.already_merged": "Son plan est déjà replié dans le plan du foyer.",
  "household.merge.skip.merge_quota_exhausted":
    "Le foyer a utilisé ses fusions de la semaine.",
  "household.merge.held": "Repris jusqu’au {to} : le prochain plan de ces jours-là les garde.",
  "household.merge.frozen":
    "Le foyer est en pause, donc rien de neuf ne peut être composé. Ce qui suit reste vrai.",
  "household.merge.load_failed":
    "Les propositions n’ont pas pu être lues. On n’affiche rien plutôt que quelque chose de faux.",
  "household.merge.open_plan": "Voir ce que son plan cuisine",
  "household.merge.close_plan": "Masquer son plan",
  "household.merge.plan_empty": "Son plan n’a aucun plat qu’on sache lire.",
  "household.merge.plan_unreadable": "Son plan n’a pas pu être lu.",
  "household.plan.title": "Ce que ce plan cuisine, et pour qui",
  "household.plan.divergence":
    "Rien n’a échoué ici. Deux directions ne sortent pas toujours de la même casserole — quand elles ne le peuvent pas, elles sont cuisinées à part.",
  "household.plan.taken":
    "{name} mange un plan à elle sur ces jours-là, donc celui-ci ne cuisine pas pour elle.",
  "household.plan.partial":
    "{name} a un plan à elle qui ne couvre qu’une partie de ces jours, donc celui-ci cuisine encore pour elle.",
  "household.plan.reclaimed": "Le plan de {name} a été replié dans celui-ci.",
  "household.plan.unmerged": "Ce plan a été reconstruit sans {name}.",
  "household.plan.unmerged_uncovered": "Son propre plan ne couvre pas tous ces jours-là.",
  "household.plan.merge_shape_unmet":
    "Cette fusion demandait quelque chose de cuisiné à part, et ce qui revient est une seule casserole pour tout le monde. Vérifie les parts avant de servir.",
  "household.plan.no_dishes":
    "Ce plan n’a aucun plat qu’on sache lire. Recompose-le depuis la page du foyer.",
  "household.plan.member_title": "Ce que le foyer cuisine",
  "household.plan.member_excluded":
    "Ces jours-là, tu manges ton propre plan, donc le plan du foyer ne cuisine pas pour toi.",
  "household.merge.error.muted_required": "Ce réglage n’a envoyé aucune valeur.",
  "household.merge.error.validated_at_required": "Cette proposition ne portait aucune date.",
  "household.merge.error.member_is_owner": "Cette ligne est la tienne.",
  "household.merge.error.no_validated_plan":
    "Cette personne n’a plus de plan validé, il n’y a donc rien à laisser.",
  "household.merge.error.notice_moved_on":
    "Leurs plans ont changé depuis que ceci s’est affiché. Recharge pour voir où on en est.",

  // ══ LA PRISE DE MAIN ET LES REFUS NOMMÉS (`plan.*`) ══════════════════════
  //
  // ⚠️ POURQUOI CE NAMESPACE EST DANS LE COULOIR D'ENTRÉE. `/app/setup` finit
  // par une GÉNÉRATION, et quand elle échoue c'est `copy/planRefusals.ts` qui
  // met des mots dessus — donc `plan.refusal.*` en toutes lettres, sur le
  // dernier écran du tunnel. Sans eux, une personne qui vient de tout remplir
  // en français lit un refus en anglais au moment exact où elle attend son plan.
  //
  // Ces phrases ne réécrivent AUCUN calcul du serveur: les fenêtres, les
  // plafonds et les dates sont calculés en amont et rendus tels quels. Ce
  // vocabulaire-ci est fermé, et c'est la seule chose qui ne porte aucune
  // arithmétique.
  "plan.hand.title": "C’est le foyer qui cuisine pour toi",
  "plan.hand.body":
    "Par défaut, le plan du foyer te nourrit, et c’est la façon ordinaire d’être ici. Si tu préfères cuisiner le tien, construis un plan ci-dessous et prends-le en main — c’est alors toi qui le cuisines et qui fais les courses.",
  "plan.hand.take_cta": "Cuisiner celui-ci moi-même",
  "plan.hand.taking": "Prise en main…",
  "plan.hand.taken_title": "C’est toi qui cuisines celui-ci",
  "plan.hand.taken_body":
    "Le plan du foyer ne cuisine pas pour toi sur ces jours-là. La personne qui tient le foyer peut proposer de le replier dedans — tu le gardes dans tous les cas.",
  "plan.hand.taken_on": "Pris en main le {date}.",
  "plan.hand.already": "Ce plan était déjà le tien à cuisiner.",
  // ⚠️ `plan.hand.owner_note` part avec la branche maître de `TakeTheHandCard`:
  // elle envoie composer « depuis la page du foyer », qui ne composera plus rien.
  "plan.hand.owner_note":
    "C’est toi qui tiens ce foyer, donc le plan que tu cuisines est celui du foyer. Compose-le depuis la page du foyer.",
  "plan.refusal.household_frozen":
    "Ce foyer est en pause, donc aucune nouvelle semaine n’est composée. Rien n’a été effacé.",
  "plan.refusal.no_household": "Tu n’es dans aucun foyer.",
  "plan.refusal.not_owner": "Seule la personne qui tient le foyer peut faire ça.",
  "plan.refusal.empty_household": "Il n’y a encore personne à cette table.",
  "plan.refusal.goal_required":
    "Pose d’abord une direction et une situation — c’est là-dessus que tout le plan se construit.",
  "plan.refusal.no_coach": "Il n’y a encore aucune méthode publiée à cuisiner.",
  "plan.refusal.local_day_unresolved":
    "On n’a pas su dire quel jour il est là où tu es, et un plan se compte en jours.",
  "plan.refusal.window_required": "Cette demande ne nommait aucun jour à couvrir.",
  "plan.refusal.bad_window":
    "Ces dates ne peuvent pas faire un plan. Un plan part d’aujourd’hui ou d’un "
    + "jour à venir, et tient en sept jours au plus.",
  "plan.refusal.window_beyond_this_week":
    "Un plan s’écrit en noms de jours, et ceux-ci ne vont pas plus loin que dimanche prochain. Commence cette semaine, ou reviens une fois la semaine suivante entamée.",
  "plan.refusal.plan_overlaps_existing":
    "Ces jours-là tombent dans un plan que tu as déjà. Couvre-le jusqu’à son dernier jour, ou remplace-le.",
  "plan.refusal.unknown_intent": "Cette demande n’a pas dit ce qu’elle remplace.",
  "plan.refusal.replaces_required": "Cette demande n’a pas dit quel plan elle remplace.",
  "plan.refusal.mode_required":
    "Dis par où commencer : avec ce que tu as, ou en faisant les courses.",
  "plan.refusal.pantry_required":
    "Ajoute ce que tu as en réserve, ou passe en mode courses.",
  "plan.refusal.unknown_operation": "Ce n’est pas un geste que cette page connaît.",
  "plan.refusal.window_fully_away":
    "Personne ne mange ici sur ces jours-là, il n’y a donc rien à cuisiner.",
  "plan.refusal.all_members_have_own_plan":
    "Tout le monde ici cuisine déjà un plan à soi sur ces jours-là.",
  "plan.refusal.safety_constraints_unreadable":
    "On n’a pas pu lire les allergies de ce foyer, et on ne cuisine jamais sans elles.",
  "plan.refusal.empty_meal":
    "Rien d’exploitable n’est revenu. Ton plan précédent est intact — réessaie.",
  "plan.refusal.meal_unparseable":
    "La réponse est revenue sous une forme illisible. Ton plan précédent est intact — réessaie.",
  "plan.refusal.model_returned_tool_call":
    "La réponse est revenue sous une forme illisible. Ton plan précédent est intact — réessaie.",
  "plan.refusal.plan_not_written":
    "Le plan n’a pas pu être enregistré. Ton plan précédent est intact — réessaie.",
  "plan.refusal.plan_adoption_timed_out":
    "L’enregistrement a pris trop de temps et a été arrêté. Aucun plan incomplet n’a été enregistré — réessaie.",
  "plan.refusal.house_rule_violated":
    "Ce qui est revenu enfreignait une des règles de ce foyer, donc ça n’a pas été gardé.",
  "plan.refusal.merge_member_required": "Ce geste n’a pas dit quel plan replier.",
  "plan.refusal.merge_member_not_in_household": "Cette personne n’est pas dans ce foyer.",
  "plan.refusal.merge_member_is_owner":
    "Le plan du foyer est déjà le tien : il n’y a rien à ramener.",
  "plan.refusal.merge_member_has_no_plan":
    "Cette personne n’a aucun plan validé à elle à replier.",
  "plan.refusal.merge_no_household_plan":
    "Il n’y a aucun plan de foyer en cours dans lequel replier. Compose-en un d’abord.",
  "plan.refusal.merge_windows_disjoint":
    "Son plan et celui du foyer n’ont aucun jour en commun, il n’y a donc rien à replier.",
  "plan.refusal.merge_window_all_past":
    "Tous les jours que son plan partage avec celui-ci sont déjà derrière nous.",
  "plan.refusal.merge_window_unreadable": "Ces jours n’ont pas pu être lus.",
  "plan.refusal.merge_plan_vanished": "Ce plan n’est plus lisible. Réessaie.",
  "plan.refusal.merge_member_away_all_window":
    "Cette personne est notée absente à tous les repas de ces jours-là.",
  "plan.refusal.merge_quota_exhausted":
    "Ce foyer a utilisé ses fusions de la semaine. Rien n’est perdu, et ça repart la semaine prochaine.",
  "plan.refusal.unmerge_member_required": "Ce geste n’a pas dit qui ressortir.",
  "plan.refusal.unmerge_member_not_in_household": "Cette personne n’est pas dans ce foyer.",
  "plan.refusal.unmerge_member_is_owner":
    "Le plan du foyer est le tien : il n’y a personne à en sortir.",
  "plan.refusal.unmerge_member_not_merged":
    "Aucun plan de foyer en cours ne l’a ramenée à cette table, il n’y a donc rien à défaire.",
  "plan.refusal.unmerge_window_all_past":
    "Ce plan de foyer n’a plus aucun jour devant lui. Il ne reste rien à cuisiner autrement.",
  "plan.refusal.unmerge_window_unreadable": "Ces jours n’ont pas pu être lus.",
  // Les deux refus du brouillon. Ils disent d'abord ce qui n'a PAS bougé.
  "plan.refusal.draft_not_composed":
    "L’aperçu n’a pas abouti. Rien n’a été enregistré, ton plan n’a pas bougé.",
  "plan.refusal.note_unusable":
    "Je ne peux pas repartir de cette phrase-là. Reformule ce que tu veux changer dans le plan.",
  "plan.validate.error.not_authenticated": "Tu n’es plus connecté.",
  "plan.validate.error.not_your_plan": "Ce plan n’est pas le tien.",
  "plan.validate.error.plan_retired": "Ce plan a été remplacé.",
  "plan.validate.error.not_a_personal_plan":
    "Le plan du foyer n’est pas quelque chose à prendre en main — c’est déjà ce que tout le monde mange.",

  // ══ /app/setup — LE TUNNEL D'ENTRÉE ═════════════════════════════════════
  //
  // Trois étapes, et la dernière action EST la génération. Aucune copie ici ne
  // doit faire ATTENDRE quelqu'un: « ton coach prépare ton plan » est faux dans
  // ce produit, le coach ne prépare rien pour personne (docs/keel/MODEL.md).
  // Le bouton compose, et l'écran suivant est le plan.
  "setup.title": "Installez votre cuisine",
  "setup.subtitle": "Trois étapes, et votre premier plan.",
  "setup.progress": "Étape {n} sur {total}",
  "setup.loading": "On reprend où vous en étiez…",
  "setup.error.title": "On n’a pas pu relire où vous en étiez.",
  "setup.back": "Retour",
  "setup.next": "Continuer",
  // PERSONNE N'EST RETENU DANS UN COULOIR. La sortie est visible à chaque
  // étape, et ce qui a déjà été enregistré l'est vraiment.
  "setup.skip": "Passer pour l’instant",
  "setup.skip_hint":
    "Rien de ce que vous avez répondu n’est perdu. Vous pourrez revenir depuis votre plan.",
  "setup.saved": "Enregistré.",
  "setup.situate.title": "Pour combien de personnes cuisinez-vous ?",
  "setup.situate.hint":
    "C’est ce qui dimensionne chaque plan qu’on construit, et c’est tout ce dont cette étape a besoin. Vous pourrez le changer plus tard.",
  "setup.situate.solo": "Juste moi",
  "setup.situate.solo_hint":
    "Un plan, vos parts, en batch cooking si c’est votre façon de faire.",
  "setup.situate.pair": "On est deux",
  "setup.situate.pair_hint":
    "Une casserole, deux parts — même quand vous ne visez pas la même chose.",
  "setup.situate.family": "Trois ou plus",
  "setup.situate.family_hint": "La maison cuisine une fois, et chacun reçoit sa part.",
  "setup.situate.member":
    "Quelqu’un d’autre tient ce foyer et compose pour lui. Ce qui suit ne concerne que vous — vos parts, votre direction, et un plan à vous si vous en voulez un.",
  // Voir la note d'`en.ts`: le verrou garde sa raison, il la dit enfin, et il
  // s'ouvre quand il n'y a plus personne à effacer.
  "setup.situate.solo_locked":
    "« Juste moi » est désactivé tant que d’autres personnes sont à cette table. Retire-les plus bas, une par une, et il revient.",
  "setup.situate.dissolve_confirm":
    "Ceci défait le foyer. Votre propre place à table part avec : vos parts de foyer, vos habitudes de cuisine, ce que vous ne voulez pas voir servir et les allergies enregistrées ici. Votre profil, votre direction et votre poids visé ne bougent pas — vous continuez seul.",
  "setup.situate.dissolve_do": "Défaire le foyer",
  "setup.situate.dissolve_cancel": "Le garder",
  "setup.situate.dissolve_not_alone":
    "Quelqu’un d’autre est encore à cette table. Retire-le d’abord — on ne défait rien ici tant qu’une place est prise.",
  "setup.situate.dissolve_has_plans":
    "Ce foyer a déjà cuisiné. Ses plans restent, donc il ne se défait pas depuis ici.",
  "setup.people.title": "Vous",
  "setup.people.intro":
    "Vous aussi, vous mangez ici. Vous êtes la première place à table, pas la personne qui la tient.",
  "setup.people.first_name": "Prénom",
  "setup.people.birth_date": "Date de naissance",
  "setup.people.birth_date_hint":
    "Une direction ne s’applique qu’à un âge connu. Sans elle, vous recevez une part standard, et rien ne le dit.",
  "setup.people.birth_date_error": "Cette date est dans le futur, ou on ne sait pas la lire.",
  "setup.people.height": "Taille (cm)",
  "setup.people.gender": "Sexe",
  "setup.people.weight": "Poids (kg)",
  // ── L'ACTIVITÉ — QUATRE CRANS, ET JAMAIS UN NOMBRE (L0, 2026-08-18) ─────
  // Les quatre libellés courts sont NEUTRES EN PERSONNE: les mêmes servent à ma
  // fiche et à celle d'une autre bouche. Seuls la question et son aide changent
  // de personne. Voir le bloc jumeau de `en.ts` pour le pourquoi complet.
  // ② Voir la note d'`en.ts`: deux axes, parce qu'une journée n'est pas un sport.
  // ③ Voir la note d'`en.ts`: on demande ce qui SE FAIT, jamais ce qu'on aime.
  "setup.traditions.title": "Les jours que vous ne déplacez pas",
  "setup.traditions.hint":
    "Le rôti du dimanche, le poisson du vendredi. Dites-le et le plan compose autour, au lieu de composer par-dessus. Deux ou trois suffisent — trois au maximum.",
  "setup.traditions.weekday": "Jour",
  "setup.traditions.slot": "Repas",
  "setup.traditions.slot_breakfast": "Petit-déjeuner",
  "setup.traditions.slot_lunch": "Déjeuner",
  "setup.traditions.slot_dinner": "Dîner",
  "setup.traditions.label": "C'est quoi, dans vos mots",
  "setup.traditions.label_placeholder": "rôti, poisson, pizza...",
  "setup.traditions.add": "Ajouter",
  "setup.traditions.remove": "Retirer",
  "setup.traditions.empty": "Rien de posé — le plan compose tous les repas.",
  "setup.traditions.full":
    "Trois, c'est le maximum. Retirez-en un pour en ajouter un autre.",
  "setup.traditions.day_mon": "Lundi",
  "setup.traditions.day_tue": "Mardi",
  "setup.traditions.day_wed": "Mercredi",
  "setup.traditions.day_thu": "Jeudi",
  "setup.traditions.day_fri": "Vendredi",
  "setup.traditions.day_sat": "Samedi",
  "setup.traditions.day_sun": "Dimanche",
  "setup.day_activity.label": "Vos journées, elles sont comment ?",
  "setup.day_activity.member_label": "Ses journées, elles sont comment ?",
  "setup.day_activity.seated": "Plutôt assis",
  "setup.day_activity.seated_hint": "Assis toute la journée, peu de marche.",
  "setup.day_activity.on_feet": "Debout, en mouvement",
  "setup.day_activity.on_feet_hint":
    "Debout ou en mouvement une bonne partie du jour.",
  "setup.day_activity.physical_job": "Métier physique",
  "setup.day_activity.physical_job_hint":
    "Porter, marcher, monter — toute la journée.",
  "setup.sport.label": "Et le sport ?",
  "setup.sport.member_label": "Et le sport, pour elle ou lui ?",
  "setup.sport.none": "Pas de sport",
  "setup.sport.none_hint": "Aucune séance en ce moment.",
  "setup.sport.1_2": "1 à 2 par semaine",
  "setup.sport.1_2_hint": "Une ou deux séances dans une semaine ordinaire.",
  "setup.sport.3_4": "3 à 4 par semaine",
  "setup.sport.3_4_hint": "Trois ou quatre séances dans une semaine ordinaire.",
  "setup.sport.5_plus": "5 ou plus par semaine",
  "setup.sport.5_plus_hint": "Cinq séances par semaine ou davantage.",
  "setup.activity.label": "Vos journées, elles sont comment ?",
  "setup.activity.hint":
    "Ça dimensionne chacune de vos parts. Entre huit heures assis et quatre " +
    "séances par semaine, il y a environ quarante pour cent d’écart — sans " +
    "réponse, on suppose le milieu, ce qu’on faisait jusqu’ici.",
  "setup.activity.member_label": "Ses journées, elles sont comment ?",
  "setup.activity.member_hint":
    "Pareil, pour sa part à elle. Laissez vide si vous n’êtes pas sûr — on suppose " +
    "le milieu plutôt que de deviner à sa place.",
  "setup.activity.sedentary": "Surtout assis",
  "setup.activity.sedentary_hint": "Assis toute la journée, peu de marche.",
  "setup.activity.on_feet": "Debout, en mouvement",
  "setup.activity.on_feet_hint":
    "Debout ou en mouvement une bonne partie du jour.",
  "setup.activity.trains_some": "Du sport régulier",
  "setup.activity.trains_some_hint": "Du sport deux à trois fois par semaine.",
  "setup.activity.trains_hard": "Du sport intensif",
  "setup.activity.trains_hard_hint":
    "Du sport quatre fois ou plus, ou un métier physique.",
  // Ces deux phrases ne s'affichent jamais aujourd'hui — l'activité ne refuse
  // aucune composition. Le `Record` complet de `copy/setupMisses.ts` les
  // réclame quand même, et c'est lui la garde.
  "setup.activity.missing_own":
    "Dites-nous comment sont vos journées, pour que vos parts soient " +
    "dimensionnées sur vous et pas sur une moyenne.",
  "setup.activity.missing_member":
    "Dites-nous comment sont ses journées, pour que sa part soit dimensionnée " +
    "sur elle et pas sur une moyenne.",

  "setup.people.goal": "Ce que vous visez",
  // Le régime est posé AVANT les allergies: c'est la question qui écarte le
  // plus de choses, et l'ordre évite de cocher « poisson » en allergie quand la
  // vraie réponse est « je suis végétarien ».
  "setup.people.diet": "Comment vous mangez",
  "setup.people.diet_hint":
    "Ça gouverne chaque plat qu'on compose. Une fois dit ici, c'est dit — ce n'est " +
    "pas une préférence qu'on pondère, c'est une ligne qu'on ne franchit pas.",
  "setup.people.diet_omnivore": "Je mange de tout",
  "setup.people.diet_vegetarian": "Végétarien",
  "setup.people.diet_vegan": "Végane",
  "setup.people.diet_pescatarian": "Pescatarien",
  "setup.people.allergies": "Vous êtes allergique à quelque chose ?",
  "setup.people.allergies_hint":
    "Médical uniquement. Ça sort de toute la casserole. Les dégoûts viennent après.",
  "setup.people.allergies_none": "Rien à déclarer",
  "setup.people.allergies_other": "Autre chose",
  "setup.people.allergies_add": "Ajouter",
  "setup.people.allergies_remove": "Retirer",
  "setup.mouths.title": "Qui mange ici, à part vous",
  "setup.mouths.intro":
    "Trois choses par personne, et le plan de ce soir les compte déjà.",
  // ⚠️ `setup.mouths.discard` (« Effacer cette fiche ») est parti le
  // 2026-08-19: la fiche se REFERME maintenant, et le mot que l'utilisateur a
  // demandé est « Retirer » (`setup.mouths.remove`, partagé avec la carte
  // d'une personne inscrite).
  "setup.mouths.add": "Ajouter quelqu’un qui mange ici",
  "setup.mouths.add_confirm": "Ajouter à la table",
  "setup.mouths.first_name_hint":
    "C'est ainsi que le plan nommera sa part.",
  "setup.mouths.first_name_hint_you": "C'est ainsi que le plan nommera votre part.",
  "setup.mouths.kind": "C’est un adulte ou un enfant ?",
  "setup.mouths.kind_adult": "Un adulte",
  "setup.mouths.kind_child": "Un enfant",
  "setup.mouths.kind_hint":
    "Un enfant peut avoir une direction lui aussi — manger mieux, mieux " +
    "s’entraîner. Ce qu’on ne fait jamais pour un enfant, c’est une perte de " +
    "poids ou un travail de silhouette : c’est intégré, ce n’est pas un réglage.",
  "setup.mouths.body": "Taille, poids et sexe",
  "setup.mouths.body_hint": "Les trois ensemble, ou aucun des trois.",
  // ⚠️ LA MÊME RÈGLE, DITE SANS LE GROUPE. La fiche d'ajout a éclaté le
  // triplet en deux paires étiquetées (même disposition que la carte du
  // titulaire), et « les trois » n'y désigne donc plus rien. Cette ligne-ci
  // les NOMME, parce qu'elle vit seule sous la grille.
  "setup.mouths.body_together":
    "Taille, poids et sexe vont ensemble : les trois, ou aucun.",
  "setup.mouths.goal": "Ce qu’il ou elle vise",
  "setup.mouths.goal_none": "Aucune direction particulière",
  "setup.mouths.goal_from_profile":
    "Posée dans son propre profil — elle le suit partout, pas seulement à cette table.",
  "setup.mouths.allergies":
    "{who} est allergique à quelque chose ?",
  "setup.mouths.allergies_you": "Vous êtes allergique à quelque chose ?",
  // Voir la note d'`en.ts`: la carte ne s'édite qu'au bouton.
  "setup.mouths.edit": "Modifier",
  "setup.mouths.edit_done": "Terminé",
  "setup.mouths.summary_on_file": "Renseignée",
  "setup.mouths.remove": "Retirer",
  "setup.mouths.remove_confirm": "Retirer définitivement ?",
  "setup.mouths.duplicate":
    "{name} mange déjà ici. Deux personnes avec le même prénom auraient la " +
    "même ligne dans le plan — donne à la seconde un prénom qu’on peut " +
    "distinguer.",
  "setup.mouths.full":
    "Huit, c’est le maximum d’un foyer. Chaque bouche est une part de plus à composer à chaque génération.",
  "setup.mouths.branch_full":
    "Le nombre de personnes choisi à la première étape est déjà atteint. Revenez à cette étape pour le modifier.",
  // Voir la note d'`en.ts`: l'absorption reste voulue, son silence non.
  // ⚠️ LA SORTIE EST NOMMÉE PAR SON LIBELLÉ RÉEL. Cette phrase a dit
  // « Effacer cette fiche » jusqu'au 2026-09-01, alors que le bouton porte
  // « Retirer » (`setup.mouths.remove`) depuis le 2026-08-19: elle envoyait
  // chercher un bouton qui n'existe pas, ce qui est exactement le défaut
  // qu'elle était censée refermer.
  "setup.mouths.next_will_save":
    "« Continuer » enregistre aussi cette fiche, et {name} rejoint la table. « Retirer » l’annule.",
  "setup.mouths.added_by_next":
    "{name} est maintenant à table — « Continuer » a enregistré sa fiche avant de passer à la suite. Le bouton « Retirer » de sa carte l’annule.",
  "setup.access.title": "Lui donner son propre accès ?",
  "setup.access.optional": "Facultatif. Ça ne change rien pour ce soir.",
  "setup.access.waiting":
    "Rien ne l’attend. Sa place à table existe dès que vous l’ajoutez, et le plan de ce soir la compte déjà. L’accès lui permet seulement de reprendre cette place à son compte.",
  "setup.access.grants":
    "Ce que ça lui donne : elle voit le plan du foyer et pose sa propre direction. Pas : composer, ajouter ou retirer quelqu’un, ni décider ce que la maison ne sert pas.",
  "setup.access.email": "Son e-mail",
  "setup.access.submit": "Créer l’invitation",
  "setup.access.copy": "Copier le lien",
  "setup.access.copied": "Copié.",
  "setup.access.goal_carries":
    "La direction que vous posez pour elle la suit quand elle réclame sa place — après ça, c’est à elle de la changer, dans son propre À propos de vous.",
  "setup.plan.title": "Comment votre semaine se déroule",
  "setup.plan.intro":
    "Demandé une fois, pour toute la maison — ça appartient à qui cuisine.",
  "setup.table.title": "Qui mange, et quand",
  // ⚠️ RÉÉCRITE LE 2026-08-14 AVEC LA CARTE QU'ELLE COIFFE — voir `en.ts`.
  "setup.table.intro":
    "Une carte par personne, la même pour tout le monde. Seuls les moments que vous cochez sont composés.",
  "setup.table.each_title": "Ceux qui mangent autrement",
  "setup.table.each_intro":
    "Laissez une personne telle quelle et elle mange aux moments ci-dessus. " +
    "Cochez ses propres moments seulement s’ils diffèrent — un ado qui saute le " +
    "petit-déjeuner, un petit qui goûte l’après-midi. C’est l’habitude, pas la " +
    "semaine : les repas que quelqu’un saute vraiment — un déplacement, un " +
    "dîner dehors, un week-end ailleurs — se décochent au moment de construire " +
    "ce plan-là.",
  "setup.table.house_label": "La maison",
  "setup.table.same_as_house": "Mange aux mêmes moments que la maison.",
  // ── LE RÉGIME, PAR BOUCHE ────────────────────────────────────────────
  // Volontairement PLUS COURT que `setup.people.diet_hint`: la règle est
  // déjà énoncée en tête de l'étape, sur la ligne du titulaire. La répéter
  // mot pour mot sous chaque prénom ferait lire trois fois la même phrase.
  // Ce qui reste est ce que seule CETTE ligne peut dire.
  "setup.table.diet_label": "Comment cette personne mange",
  "setup.table.diet_hint":
    "Le plat commun suit la ligne la plus stricte de la table. Rien de coché veut dire qu'on n'a pas demandé.",
  // ── LES MOMENTS, AVEC LEUR TAILLE (2026-08-14) — voir `en.ts` ────────
  "setup.table.moments_label": "Quand cette personne mange",
  "setup.table.moments_hint":
    "Cochez les moments où elle mange vraiment, et dites si c’est un gros ou un " +
    "petit repas. Laissez la taille de côté quand ça n’a pas d’importance — " +
    "rien n’est supposé d’un blanc.",
  "setup.table.size_small": "Petit",
  "setup.table.size_medium": "Moyen",
  "setup.table.size_large": "Gros",
  // ── LA LIGNE LIBRE (2026-08-14) — voir `en.ts` ───────────────────────
  // ⚠️ PAS « Ce qu’elle mange d’habitude »: c'est MOT POUR MOT le titre du
  // cadre qu'on retire (`household.habits.title`) — voir `en.ts`.
  "setup.table.note_label": "Ses préférences, en toutes lettres",
  "setup.table.note_hint":
    "En toutes lettres, et gardé pour de bon — relu à chaque fois qu’on " +
    "compose. Habitudes, goûts, ce à quoi elle ne touche jamais.",
  "setup.table.note_placeholder":
    "Le matin des fruits, une pizza le vendredi soir, le samedi midi ce que je viens d’acheter au marché.",
  "household.member.diet": "Comment cette personne mange",
  // Les MÊMES mots que `setup.people.diet_*`, dans le namespace de cette
  // page: la liste des jetons est partagée (`DIET_ANSWERS`), les libellés ne
  // traversent pas la couture (`pageSeams.int.test.ts`).
  "household.member.diet_omnivore": "Mange de tout",
  "household.member.diet_vegetarian": "Végétarien",
  "household.member.diet_vegan": "Végane",
  "household.member.diet_pescatarian": "Pescétarien",
  "household.member.diet_hint":
    "Ça gouverne chaque plat qu'on compose pour le foyer. Le plat commun suit la ligne la plus stricte de la table.",
  "household.member.diet_from_profile":
    "Elle a un compte : comment elle mange se règle dans son \u00ab à propos de toi \u00bb.",
  "household.error.bad_diet": "Ce n'est pas une des quatre réponses.",
  "household.error.has_account":
    "Elle a un compte : ça se règle dans son \u00ab à propos de toi \u00bb, pas ici.",
  // L5 · les refus des portes du poids visé et du rythme (20260818190000).
  "household.error.target_incomplete":
    "Un poids visé et un rythme vont ensemble — l'un sans l'autre ne mène nulle part.",
  "household.error.bad_target_weight": "Ce poids visé est hors de 25 à 400 kg.",
  "household.error.bad_pace": "Ce rythme est hors de ce qu'on sait cuisiner.",
  "household.error.target_needs_direction":
    "Un poids visé n'existe que si la balance doit bouger. Choisis d'abord perdre ou prendre.",
  "household.error.no_member_id":
    "Elle a bien été ajoutée, mais sa ligne ne nous est pas revenue — rouvre le foyer et termine sa fiche.",
  // ── L5 · LE POP-UP « UNE BOUCHE » (2026-08-18) ──────────────────────────
  // Six blocs, trois obligatoires. Il s'ouvre à chaque ajout de personne, MAÎTRE
  // COMPRIS. ⛔ Aucune clé ne demande « adulte ou enfant »: la date de naissance
  // le dit.
  "household.mouth.title": "Quelqu'un qui mange ici",
  "household.mouth.intro":
    "Trois choses dont on a besoin, trois que tu peux sauter. Tu peux fermer et revenir — rien n'est perdu.",
  "household.mouth.later": "Plus tard",
  "household.mouth.block_habits": "ce qu'elle mange déjà",
  "household.mouth.block_allergies": "les allergies",
  "household.mouth.block_tastes": "ses dégoûts et son régime",
  "household.mouth.preferences_open":
    "Renseigner ses préférences alimentaires",
  "household.mouth.preferences_open_you":
    "Renseigner tes préférences alimentaires",
  "household.mouth.preferences_saved": "Les préférences de {name} sont enregistrées.",
  "household.mouth.preferences_title": "Préférences alimentaires",
  "household.mouth.preferences_title_named": "{name} — préférences alimentaires",
  "household.mouth.preferences_intro":
    "Rien ici n'est obligatoire. Ça affine le plan ; ça n'en décide pas la forme.",
  "household.mouth.preferences_empty":
    "Rien de renseigné pour l'instant — habitudes, allergies, dégoûts, régime.",
  "household.mouth.preferences_filled": "Déjà renseigné : {blocks}.",
  "household.mouth.preferences_done": "Terminé",
  "household.mouth.save": "Enregistrer",
  "household.mouth.add": "L'ajouter",
  "household.mouth.fold": "Replier",
  "household.mouth.unfold": "Ouvrir",
  "household.mouth.held": "Il manque encore : {blocks}.",
  "household.mouth.block_identity": "son prénom et sa date de naissance",
  "household.mouth.block_direction": "le sens dans lequel la balance va",
  "household.mouth.block_body": "taille, poids, sexe et niveau d'activité",
  "household.mouth.identity": "Qui c'est",
  "household.mouth.identity_hint":
    "Le prénom est ce qui nomme sa part — une part au prénom vide est écartée en silence.",
  "household.mouth.identity_hint_you":
    "Ton prénom est ce qui nomme ta part — une part au prénom vide est écartée en silence.",
  "household.mouth.birth_date_hint":
    "On ne demande jamais si c'est un adulte ou un enfant : la date de naissance le dit.",
  "household.mouth.age_unknown":
    "On ne sait pas lire cette date, donc aucune direction ne s'appliquera pour l'instant.",
  "household.mouth.direction": "Le sens dans lequel la balance va",
  "household.mouth.direction_hint":
    "Descendre, monter, ou ne pas bouger. Descendre ou monter déplie un poids visé et un rythme.",
  "household.mouth.target_weight": "Poids visé (kg)",
  "household.mouth.target_weight_hint":
    "Avec le rythme ci-dessous, il donne une date d'arrivée.",
  "household.mouth.target_refused_implausible":
    "C'est hors de ce qu'on sait traiter (de 25 à 400 kg).",
  "household.mouth.target_refused_wrong_direction":
    "Ça va dans le sens contraire de la direction choisie au-dessus.",
  "household.mouth.target_refused_below_energy_floor":
    "Y arriver ferait passer sa journée sous le plancher d'énergie. Vise un peu plus haut.",
  "household.mouth.pace": "À quelle vitesse",
  // ⛔ `pace_hint` ET `pace_hint_you` RETIRÉES LE 2026-09-01, à la demande.
  // « Le maximum de ce curseur est réglé sur ton corps — c'est le rythme le
  // plus rapide que le plan sait vraiment cuisiner. » Le plafond se VOIT sur
  // le contrôle: il ne monte pas plus haut. Les deux clés sont parties des
  // catalogues ET de `VoicedKey` — voir `MouthFormDialog.tsx`, au `Field`
  // du curseur.
  "household.mouth.pace_value": "{pace} kg par semaine",
  "household.mouth.pace_needs_body":
    "Renseigne taille, poids et sexe juste au-dessus, et le curseur apparaît ici.",
  "household.mouth.pace_no_margin":
    "Ce corps n'a pas de marge de perte sans passer sous le plancher d'énergie. La direction continue de façonner ses parts.",
  "household.mouth.arrival": "Environ {weeks} semaines à ce rythme.",
  "household.mouth.who_fallback": "cette personne",
  "household.mouth.body":
    "Son corps",
  "household.mouth.body_you":
    "Ton corps",
  "household.mouth.body_hint":
    "Sert à dimensionner les parts. Il n'est jamais énoncé, ni à table ni à côté d'un prénom.",
  "household.mouth.activity":
    "Son niveau d'activité",
  "household.mouth.activity_you":
    "Ton niveau d'activité",
  "household.mouth.activity_hint":
    "Sans ça, tout chiffre de calories est une constante devinée qui a l'aplomb d'un tableau.",
  "household.mouth.activity_sedentary": "Assis toute la journée, peu de marche",
  "household.mouth.activity_on_feet": "Debout ou en mouvement une bonne partie du jour",
  "household.mouth.activity_trains_some": "Sport 2 à 3 fois par semaine",
  "household.mouth.activity_trains_hard": "Sport 4 fois ou plus, ou métier physique",
  // ② Voir la note d'`en.ts`: deux axes, parce qu'une journée n'est pas un sport.
  "household.mouth.day_activity": "La journée de {who}",
  "household.mouth.day_activity_you": "Ta journée",
  "household.mouth.day_activity_hint":
    "Le travail et la vie courante, sport mis à part. Le sport, c'est la question juste après.",
  "household.mouth.day_activity_seated": "Assis toute la journée, peu de marche",
  "household.mouth.day_activity_on_feet": "Debout ou en mouvement une bonne partie du jour",
  "household.mouth.day_activity_physical_job":
    "Métier physique : porter, marcher, monter, toute la journée",
  "household.mouth.sport": "Le sport, pour {who}",
  "household.mouth.sport_you": "Le sport, pour toi",
  "household.mouth.sport_hint":
    "Des séances par semaine, journée mise à part. « Pas de sport » est une réponse, et elle compte.",
  "household.mouth.sport_none": "Pas de sport",
  "household.mouth.sport_1_2": "1 à 2 fois par semaine",
  "household.mouth.sport_3_4": "3 à 4 fois par semaine",
  "household.mouth.sport_5_plus": "5 fois par semaine ou plus",
  // ① Voir la note d'`en.ts`: le plan ne compose que le plat.
  "household.mouth.meal_structure": "Ce qu'il y a d'autre dans l'assiette de {who}",
  "household.mouth.meal_structure_you": "Ce qu'il y a d'autre dans ton assiette",
  "household.mouth.meal_structure_hint":
    "Le plan ne compose que le plat. Dis-lui ce qui l'accompagne.",
  "household.mouth.takes_dessert": "Un dessert, un fruit ou un yaourt ?",
  "household.mouth.takes_cheese": "Du fromage ?",
  "household.mouth.takes_bread": "Du pain ?",
  "household.mouth.answer_yes": "Oui",
  "household.mouth.answer_no": "Non",
  // ⑤ Voir la note d'`en.ts`: on ne demande pas l'appétit, on demande de quel
  // côté de l'incertitude de la formule la personne se situe.
  "household.mouth.appetite": "Comment {who} mange, d'habitude",
  "household.mouth.appetite_you": "Comment tu manges, d'habitude",
  // ⛔ « Le calcul se trompe d'environ 10 %. » RETIRÉE LE 2026-09-01, demandée
  // à l'écran. Elle expliquait POURQUOI on pose la question (l'incertitude
  // inter-individuelle de Mifflin-St Jeor) à quelqu'un qui n'a qu'à y
  // répondre. Ce que la question doit dire tient dans la comparaison — « à
  // carrure égale » —, et c'est elle qui empêche de lire « as-tu faim ».
  //
  // ⚠️ ET ELLE EST VOISÉE DEPUIS CE LOT. La phrase restante PORTE le pronom;
  // en voix unique elle tutoyait quelqu'un dont ce n'est pas la fiche. Le
  // défaut existait avant, caché derrière la phrase qui vient de partir.
  "household.mouth.appetite_hint": "À carrure égale, {who} mange…",
  "household.mouth.appetite_hint_you": "À carrure égale, tu manges…",
  "household.mouth.appetite_small": "Moins",
  "household.mouth.appetite_average": "Comme la plupart",
  "household.mouth.appetite_large": "Plus",
  // Voir la note d'`en.ts`: la question dimensionne la section du dessous.
  // ══════════════════════════════════════════════════════════════════════
  // LA SECTION FUSIONNÉE — « quand » et « quoi » ne font qu'une question
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ ELLES ÉTAIENT DEUX SECTIONS, ET C'ÉTAIT LA MÊME QUESTION POSÉE EN DEUX
  // FOIS. « Combien de fois tu manges par jour » cochait des moments; « Ce que
  // tu manges déjà » redemandait, plus bas, une ligne par moment coché. Entre
  // les deux, rien ne disait que la seconde DÉPENDAIT de la première — on
  // cochait en haut, et le détail apparaissait ailleurs.
  //
  // Le détail vit désormais DANS la case qu'il concerne: cocher un moment
  // ouvre son champ. Une question, un endroit.
  "household.mouth.eating": "Quand {who} mange, et quoi",
  "household.mouth.eating_you": "Quand tu manges, et quoi",
  "household.mouth.eating_hint":
    "Coche les moments où {who} mange vraiment — chacun ouvre de quoi dire ce qui s’y passe déjà.",
  "household.mouth.eating_hint_you":
    "Coche les moments où tu manges vraiment — chacun ouvre de quoi dire ce que tu y prends déjà.",
  // ⚠️ UNE ÉTIQUETTE VISIBLE, PAS LE PLACEHOLDER. Le placeholder disparaît à la
  // première frappe; le nom du moment, lui, est sur la case au-dessus et ne dit
  // pas CE QU'ON DEMANDE. Même règle que les trois nombres du shaker.
  "household.mouth.habit_field": "Des habitudes ?",
  // ── LES BULLES DE CE QUI EST PRIS À CÔTÉ DU PLAT (2026-09-01) ──────────
  //
  // ⛔ ELLES REMPLACENT « Ce qu'il y a d'autre dans l'assiette » ET SES TROIS
  // OUI/NON. Ces trois-là étaient posés UNE FOIS POUR LA PERSONNE: « je prends
  // du pain » ne disait pas si c'était le midi, le soir, ou les deux, et le
  // même ratio partait sur les six moments — petit-déjeuner compris, que le
  // plan compose pourtant en entier.
  //
  // ⚠️ LE MOT EST NU, LE « + » EST RENDU PAR L'ÉCRAN. Une bulle allumée
  // n'affiche plus de « + »: elle DIT ce qui est pris, elle ne propose plus de
  // l'ajouter. Mettre le signe dans la traduction ferait deux clés par extra,
  // ou un « + pain » qui reste affiché une fois coché.
  "household.mouth.extras_field": "Et à côté ?",
  "household.mouth.extra.bread": "pain",
  "household.mouth.extra.cheese": "fromage",
  "household.mouth.extra.yoghurt": "yaourt",
  "household.mouth.extra.fruit": "fruit",
  "household.mouth.extra.dessert": "dessert",
  "household.mouth.habit_shaker_here": "Le shaker de {who} est posé sur ce moment.",
  "household.mouth.habit_shaker_here_you": "Ton shaker est posé sur ce moment.",
  // ── LE MOMENT DU SHAKER ────────────────────────────────────────────────
  // ⚠️ `ShakerDraft.slot` EXISTAIT DEPUIS TOUJOURS ET N'ÉTAIT RENDU NULLE PART:
  // le champ partait donc en base avec sa valeur d'origine, sans que personne
  // ait pu la choisir. Ce n'est pas un déplacement, c'est un manque.
  "household.mouth.shaker_at": "À quel moment {who} le prend",
  "household.mouth.shaker_at_you": "À quel moment tu le prends",
  "household.mouth.shaker_at_loose": "Hors d’un moment nommé",
  // ⛔ ON NE COCHE JAMAIS UN MOMENT SANS LE DIRE. L'ajout automatique est un
  // service, pas une liberté: sans cette phrase, un moment apparaîtrait coché
  // plus haut sans que personne comprenne pourquoi.
  "household.mouth.rhythm":
    "Combien de fois {who} mange par jour",
  "household.mouth.rhythm_you":
    "Combien de fois tu manges par jour",
  "household.mouth.rhythm_hint":
    "Coche les moments où {who} mange vraiment.",
  "household.mouth.rhythm_hint_you":
    "Coche les moments où tu manges vraiment.",
  "household.mouth.rhythm_house":
    "Rien de coché veut dire que {who} mange aux moments de la maison — pas que {who} ne mange jamais.",
  "household.mouth.rhythm_house_you":
    "Rien de coché veut dire que tu manges aux moments de la maison — pas que tu ne manges jamais.",
  "household.mouth.habits":
    "Ce que {who} mange déjà",
  "household.mouth.habits_you":
    "Ce que tu manges déjà",
  "household.mouth.habits_hint":
    "Quelque chose de quotidien qui ne doit pas changer ?",
  "household.mouth.habits_hint_you":
    "Quelque chose de quotidien que tu ne veux pas changer ?",
  "household.mouth.habits_only_declared":
    "Ne montrer que ses moments",
  "household.mouth.habits_only_declared_you":
    "Ne montrer que tes moments",
  // ── ⚠️ UN EXEMPLE PAR MOMENT, ET PAS UN SEUL POUR LES SIX ───────────────
  // Le placeholder était le même partout: « un café et deux tartines » sous
  // DÎNER. Un exemple qui ne va pas avec la question n'aide pas — il apprend au
  // lecteur que l'écran ne le suit pas. Signalé le 2026-08-19.
  //
  // ⛔ CE SONT DES EXEMPLES, PAS DES SUGGESTIONS: rien de ce qui est écrit là
  // ne part en base et rien n'est proposé au plan. Ils disent le NIVEAU DE
  // DÉTAIL attendu — concret, sans quantité —, ce qu'une consigne abstraite ne
  // sait pas faire dire.
  "household.mouth.habit_placeholder_breakfast": "un café et deux tartines, un bol de céréales…",
  "household.mouth.habit_placeholder_snack_am": "un fruit, une poignée d'amandes…",
  "household.mouth.habit_placeholder_lunch": "une salade au bureau, les restes de la veille…",
  "household.mouth.habit_placeholder_snack_pm": "un yaourt, un carré de chocolat…",
  "household.mouth.habit_placeholder_dinner": "une soupe, des pâtes vite faites…",
  "household.mouth.habit_placeholder_before_bed": "une tisane, un fromage blanc…",
  // Voir la note d'`en.ts`: nom, cadre, étiquettes, et où ça part.
  "household.mouth.shaker_title":
    "Son shaker ou sa collation",
  "household.mouth.shaker_title_you":
    "Ton shaker ou ta collation",
  "household.mouth.shaker_summary":
    "Une portion : {grams} g · {protein} g de protéines · {kcal} kcal. Relis-le — une protéine tapée dans la case des calories ressemble exactement à un formulaire bien rempli.",
  "household.mouth.shaker_kept":
    "Il s’enregistre avec le reste de la fiche, par le bouton du bas — il n’y a rien à enregistrer ici.",
  "household.mouth.shaker_foreground":
    "Prendre du poids passe presque toujours par un shaker ou une collation chiffrée. Ajoute-le et il compte DANS la journée au lieu de s'ajouter par-dessus.",
  "household.mouth.shaker_background":
    "Un shaker, une collation chiffrée ? Ajoute-le et il compte dans la journée.",
  "household.mouth.shaker_add": "Ajouter un shaker ou une collation chiffrée",
  "household.mouth.shaker_label":
    "Comment {who} l'appelle",
  "household.mouth.shaker_label_you":
    "Comment tu l'appelles",
  "household.mouth.shaker_label_hint":
    "« mon shaker », « le truc du matin » — ses mots, pas les tiens.",
  "household.mouth.shaker_label_hint_you":
    "« mon shaker », « le truc du matin » — tes mots.",
  "household.mouth.shaker_grams": "grammes par portion",
  "household.mouth.shaker_protein": "protéines (g)",
  "household.mouth.shaker_kcal": "calories (kcal)",
  "household.mouth.shaker_label_source":
    "Les trois se lisent sur l'étiquette du pot. Sans eux, le shaker est contourné au lieu d'être compté.",
  // ── LE BOUTON D'ENREGISTREMENT DU SHAKER, ET LES TROIS ÉTATS ────────────
  // Il s'active dès qu'il y a un nom et UNE des trois mesures — règle demandée.
  // Mais le moteur, lui, est tout-ou-rien: une déclaration incomplète est jetée
  // par `parseFixedIntakes`. On enregistre quand même, et on DIT l'état.
  "household.mouth.shaker_save": "Enregistrer",
  "household.mouth.shaker_counted":
    "Enregistré, et compté dans la journée : les trois nombres y sont.",
  "household.mouth.shaker_kept_not_counted":
    "Enregistrable, mais il ne sera pas encore compté : le plan a besoin des trois nombres pour l’intégrer au lieu de le contourner. Ce que tu as tapé est gardé.",
  "household.mouth.shaker_needs_one":
    "Il faut au moins un nom et une des trois mesures pour l’enregistrer.",
  // ⚠️ ELLE REMPLACE « compté » QUAND IL N'Y A PAS DE BOUTON, et pas
  // seulement pour la forme: « compté » est un fait sur la BASE, et la fiche
  // d'ajout n'a pas encore de ligne où écrire. Dire « enregistré » à ce
  // moment-là serait annoncer une chose en base pendant qu'elle est dans un
  // brouillon. Voir `ShakerPort`.
  "household.mouth.shaker_with_the_card":
    "Il part avec le reste de la fiche, au moment où tu l’enregistres.",
  "household.mouth.shaker_remove": "Le retirer",
  "household.mouth.tastes":
    "Ce que {who} n'aime pas",
  "household.mouth.tastes_you":
    "Ce que tu n'aimes pas",
  "household.mouth.tastes_hint":
    "Un dégoût, pas une allergie.",
  "household.mouth.tastes_hint_you":
    "Un dégoût, pas une allergie.",
  "household.mouth.dislikes": "Aliments refusés",
  "household.mouth.dislikes_placeholder": "champignons",
  // Voir la note d'`en.ts`: le régime passe en tête parce qu'il exclut.
  "household.mouth.diet_hint": "Végétarien, vegan, pescétarien, ou rien de tout ça.",
  "household.mouth.diet":
    "Comment {who} mange",
  "household.mouth.diet_you":
    "Comment tu manges",
  "household.mouth.diet_unset": "Choisis une réponse",
  "setup.table.from_profile":
    "Cette personne a son compte — ses moments sont dans ses réglages à elle.",
  // ── LES MOYENS DE CUISSON, AU NIVEAU DU FOYER (2026-08-18) ──────────────
  // « Plaques » et pas « cuisinière »: la question est le FEU, pas le meuble —
  // induction, gaz ou vitrocéramique répondent oui, et une plaque posée sur un
  // plan de travail aussi.
  "setup.equipment.title": "Avec quoi vous cuisinez",
  "setup.equipment.intro":
    "Demandé une fois, pour toute la cuisine — elle est partagée, ce n’est donc pas une question par personne.",
  "setup.equipment.legend": "Votre cuisine",
  "setup.equipment.hint":
    "Cochez ce que vous avez vraiment. Un congélateur décide si on peut " +
    "cuisiner une fois et garder le reste ; un micro-ondes décide de ce que " +
    "« à réchauffer » veut dire le jour même. Sans réponse, rien ne change.",
  "setup.equipment.tool_oven": "Four",
  "setup.equipment.tool_stovetop": "Plaques",
  "setup.equipment.tool_microwave": "Micro-ondes",
  "setup.equipment.tool_freezer": "Congélateur",
  "setup.equipment.tool_air_fryer": "Air fryer",
  "setup.equipment.tool_pressure_cooker": "Autocuiseur",
  "setup.equipment.tool_blender": "Blender ou robot",
  "setup.equipment.save": "Enregistrer",
  "setup.equipment.saving": "Enregistrement…",
  "setup.equipment.saved": "Enregistré. Le prochain plan est bâti là-dessus.",
  "setup.equipment.error_empty":
    "Cochez-en au moins un — sans aucun des sept, il n’y a rien pour cuisiner. " +
    "Si vous préférez ne rien dire, laissez la ligne telle quelle.",
  "setup.equipment.loading": "Lecture de ce que vous avez déjà dit…",
  "setup.equipment.no_goal":
    "Renseignez d’abord votre objectif au-dessus, ensuite ceci pourra être enregistré.",
  // ── LE DÉJEUNER DE LA SEMAINE (L6, §2.2) ────────────────────────────────
  // ⚠️ AUCUNE PHRASE NE DIT « IL » NI « ELLE » : la question NOMME la personne
  // ({name}), ce qui évite d’avoir à connaître son genre pour poser une
  // question qui n’en dépend pas.
  "setup.work_lunch.title": "Le déjeuner en semaine",
  "setup.work_lunch.intro":
    "Qui mange loin de la cuisine à midi change ce que le plan doit cuisiner. " +
    "On le demande maintenant, et la semaine sort juste du premier coup.",
  "setup.work_lunch.loading": "Lecture de ce que vous avez déjà dit…",
  "setup.work_lunch.at_work": "En semaine, est-ce que {name} déjeune au bureau ?",
  "setup.work_lunch.yes": "Oui",
  "setup.work_lunch.no": "Non",
  "setup.work_lunch.mode": "Est-ce que {name} emporte une gamelle, ou mange dehors ?",
  "setup.work_lunch.mode_lunchbox": "Une gamelle",
  "setup.work_lunch.mode_outside": "Mange dehors",
  "setup.work_lunch.microwave": "Y a-t-il un micro-ondes au bureau ?",
  "setup.work_lunch.lunchbox_note":
    "Le plan compose ces déjeuners, et les rend transportables.",
  "setup.work_lunch.cold_note":
    "Sans micro-ondes, ces déjeuners doivent être bons froids. Le plan les " +
    "compose comme ça.",
  "setup.work_lunch.outside_note":
    "{n} midis de semaine seront déjà cochés « dehors » à l’étape suivante. " +
    "Le plan ne les compose pas — il dit combien viser.",
  "setup.work_lunch.grid_wins":
    "Rien n’est décidé ici. C’est la grille jour par jour de l’étape suivante " +
    "qui gagne, repas par repas.",
  "setup.request.title": "Ce plan-ci",
  "setup.request.from": "Du",
  "setup.request.to": "Au",
  "setup.request.window_hint":
    "Sept jours au plus — c’est le plafond que porte le plan lui-même.",
  "setup.request.presence_title": "Qui est là, jour par jour",
  "setup.request.presence_intro":
    "L’étape trois disait l’habitude. Ici, c’est la semaine : décoche les " +
    "repas que quelqu’un va vraiment sauter — un déplacement, un dîner " +
    "dehors, un week-end ailleurs. Seuls les jours ci-dessus sont touchés.",
  "setup.request.presence_open": "Sa semaine",
  "setup.request.presence_optional": "facultatif",
  "setup.request.intro":
    "Redemandé à chaque fois que vous en construisez un : cette semaine n’est pas la précédente.",
  "setup.plan.rhythm": "Quand vous mangez",
  "setup.plan.rhythm_hint": "Seuls les moments que vous cochez sont composés.",
  "setup.plan.time": "Combien de temps dure une session de cuisine",
  "setup.plan.time_minutes": "{n} min",
  "setup.plan.time_hours": "{n} h",
  "setup.plan.time_hint":
    "En gros. C’est un ordre de grandeur, pas un chronomètre.",
  "setup.plan.budget": "Budget de ce plan",
  "setup.plan.budget_hint":
    "Toutes les courses, dans votre monnaie. Un vrai chiffre permet d’arbitrer " +
    "— des morceaux moins chers, moins de légumes hors saison — au lieu de " +
    "deviner ce que « serré » veut dire chez vous.",
  "setup.plan.compose": "Construire mon premier plan",
  "setup.plan.composing": "Construction en cours…",
  // Les huit phrases de l'attente — voir la note d'`en.ts`.
  "setup.plan.composing_1": "On regarde qui mange à votre table…",
  "setup.plan.composing_2": "On dimensionne la part de chacun…",
  "setup.plan.composing_3": "On écarte ce que personne ici ne peut manger…",
  "setup.plan.composing_4": "On choisit les plats de vos moments…",
  "setup.plan.composing_5": "On les regroupe en sessions de cuisine…",
  "setup.plan.composing_6": "On vérifie que la semaine tient debout…",
  "setup.plan.composing_7": "On additionne la liste de courses…",
  "setup.plan.composing_8": "On écrit pourquoi chaque choix a été fait…",
  "setup.plan.compose_hint": "Ça le compose. L’écran suivant est le plan lui-même.",
  "setup.missing.title": "Avant de pouvoir le construire",
  "setup.missing.for_you": "Vous",
  "setup.missing.before_next": "Avant de continuer",
  "setup.missing.household_size": "Dites-nous pour combien de personnes vous cuisinez.",
  "setup.missing.own_first_name": "Votre prénom — c’est avec lui que le plan nomme votre part.",
  "setup.missing.own_birth_date": "Votre date de naissance.",
  "setup.missing.own_height_cm": "Votre taille, pour que vos parts soient les vôtres.",
  "setup.missing.own_gender": "Votre sexe, pour que vos parts soient les vôtres.",
  "setup.missing.own_weight_kg":
    "Votre poids. Sans un premier point, rien ne pourra dire plus tard si vous perdez trop vite.",
  "setup.missing.own_goal": "Ce que vous visez. Rien ne peut être composé sans ça.",
  "setup.missing.own_diet":
    "Comment vous mangez — « je mange de tout » est une réponse. Sans ça, un plan " +
    "entier peut être inutilisable dès le premier soir.",
  "setup.missing.own_allergies": "Si vous avez des allergies — « aucune » compte comme une réponse.",
  "setup.missing.member_first_name":
    "Un prénom pour chaque personne à table. Sans lui, sa part disparaît du plan sans un mot.",
  "setup.missing.member_birth_date": "Une date de naissance pour chaque personne à table.",
  "setup.missing.member_body":
    "Taille, poids et sexe pour chaque personne à table. Sans les trois, cette personne est servie comme tout le monde — le plan ne peut pas dimensionner sa part.",
  "setup.missing.member_goal": "Une direction pour chaque adulte à table.",
  "setup.missing.member_allergies":
    "Si chaque personne a des allergies — « aucune » compte comme une réponse.",
  "setup.missing.adult_without_birth_date":
    "Quelqu’un a une direction mais pas de date de naissance. Une direction ne s’applique qu’à un âge connu, donc en l’état cette personne recevrait une part standard et rien ne le dirait.",
  // ⚠️ « INSCRIT·E », PUIS « CONTINUER NE L'ENREGISTRE PAS » — voir la note
  // d'`en.ts`: un contresens sur le modèle, et un avertissement qui avouait un
  // geste mal placé. Les deux sont partis le 2026-08-15.
  "setup.mouths.held_typed":
    "{name} n’est pas encore enregistré·e : sa fiche est à l’écran, pas dans le foyer. « Ajouter » comme « Continuer » l’enregistrent.",
  "setup.mouths.held_one":
    "Il manque encore une personne : vous avez répondu « {answer} » à la première question.",
  "setup.mouths.held_many":
    "Il manque encore {n} personnes : vous avez répondu « {answer} » à la première question.",
  "setup.mouths.held_exit":
    "Vous êtes moins nombreux que prévu ? Revenez à la première question pour changer votre réponse.",
  "setup.missing.missing_mouths": "Ajoutez les autres personnes qui mangent ici.",
  "setup.missing.too_many_mouths": "Huit, c’est le maximum d’un foyer, vous compris.",
  // ⚠️ « CETTE MAISON » A DISPARU LE 2026-08-14 — voir `en.ts`.
  "setup.missing.eating_rhythm": "Les moments où vous mangez, sur votre carte.",
  "setup.missing.cook_days": "Les jours où vous cuisinez.",
  "setup.missing.cooking_time_min": "Combien de temps dure une session de cuisine.",
  "setup.missing.budget_amount": "Combien ce plan peut coûter.",
  "setup.missing.member_eating_rhythm":
    "Quand chacun mange, si ce n’est pas comme la maison.",

  // Les six directions, dans les mots de la personne qui répond — pas ceux d'un
  // nutritionniste. « Perdre du poids » et pas « fat_loss », qui est le jeton
  // stocké et n'a rien à faire à l'écran.
  "setup.goal.fat_loss": "Perdre du poids",
  "setup.goal.muscle_gain": "Prendre du muscle",
  "setup.goal.recomposition": "Même poids, autre silhouette",
  "setup.goal.performance": "Mieux m’entraîner",
  "setup.goal.health": "Mieux manger",
  "setup.goal.maintenance": "Maintenir un poids stable",
  "setup.occasion.breakfast": "Petit-déjeuner",
  "setup.occasion.snack_am": "Milieu de matinée",
  "setup.occasion.lunch": "Déjeuner",
  "setup.occasion.snack_pm": "Après-midi",
  "setup.occasion.dinner": "Dîner",
  "setup.occasion.before_bed": "Avant de dormir",
  // Sept cases côte à côte sur un téléphone: l'abrégé français fait trois
  // lettres comme l'anglais.
  "setup.day.mon": "Lun",
  "setup.day.tue": "Mar",
  "setup.day.wed": "Mer",
  "setup.day.thu": "Jeu",
  "setup.day.fri": "Ven",
  "setup.day.sat": "Sam",
  "setup.day.sun": "Dim",

  // ── LES TREIZE ALLERGÈNES ────────────────────────────────────────────────
  // ⚠️ SEUL LE MOT CHANGE. Le slug (`tree_nut`, `shellfish`) est la donnée que
  // le verrou de sortie compare pour refuser un plat: il ne se traduit pas, et
  // un test de parité avec le catalogue moteur le vérifie dans l'ordre.
  //
  // « Fruits à coque » et pas « Noix »: c'est le terme de l'étiquetage
  // réglementaire français (règlement INCO), donc celui qu'une personne
  // allergique a déjà lu cent fois sur un emballage.
  "allergen.peanut": "Arachides",
  "allergen.tree_nut": "Fruits à coque",
  "allergen.gluten": "Gluten",
  "allergen.wheat": "Blé",
  "allergen.dairy": "Produits laitiers",
  "allergen.egg": "Œufs",
  "allergen.fish": "Poisson",
  "allergen.shellfish": "Crustacés",
  "allergen.mollusc": "Mollusques",
  "allergen.sesame": "Sésame",
  "allergen.soy": "Soja",
  "allergen.pork": "Porc",
  "allergen.alcohol": "Alcool",
  "allergen.celery": "Céleri",
  "allergen.mustard": "Moutarde",
  "allergen.sulphite": "Sulfites",
  // Le mot est le même dans les deux langues, comme « Gluten »: il rejoint donc
  // la liste blanche de `parity.int.test.ts`, qui refuse par défaut deux
  // traductions identiques (une clé non traduite s'y voit exactement pareil).
  "allergen.lupin": "Lupin",

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 3 — LES ATOMES PARTAGÉS
  //
  // Les tables jeton → mot que `api/labels.ts` lit DYNAMIQUEMENT. Elles ne
  // dépendent d'aucun écran: un jeton vient de la base, et n'importe quelle
  // page de plan peut le rendre. C'est pour ça qu'elles entrent ensemble et
  // avant les pages — voir le bloc « LES ATOMES PARTAGÉS » de `catalog.ts`.
  //
  // ⚠️ SEULES LES VALEURS SONT ICI. Les clés (`unit.one.serving`,
  // `day.long.mon`) sont des jetons ASCII anglais et ne se traduisent jamais.
  // ══════════════════════════════════════════════════════════════════════════

  // ── Les mots communs ─────────────────────────────────────────────────────
  "common.clear": "effacer",
  // Le dernier maillon d'une énumération. `namedDays` colle les précédents avec
  // des virgules et confie les deux derniers à cette clé.
  "common.list_pair": "{first} et {second}",
  "common.back": "Retour",
  "common.cancel": "Annuler",
  "common.close": "Fermer",
  "common.continue": "Continuer",

  // ── La note de sécurité, côté coach ──────────────────────────────────────
  "safety.note_title": "Pour information",
  "safety.stat_notes": "Avec une note",

  // ── La photo de repas ────────────────────────────────────────────────────
  // CONTRAT non-entrée n°4: une photo atteste ce qu'il y a dans l'assiette,
  // elle ne le mesure jamais. Aucune calorie, aucun gramme, aucun pourcentage
  // — y compris aucun pourcentage de confiance — ne doit apparaître ici.
  "photo.button": "Ajouter une photo",
  "photo.button_hint":
    "Prends l’assiette en photo. Je lis ce qu’il y a dessus, jamais combien de calories.",
  "photo.choose": "Choisir une photo",
  "photo.change": "En choisir une autre",
  "photo.preview_alt": "La photo que tu t’apprêtes à envoyer",
  "photo.send": "Envoyer cette photo",
  "photo.sending": "Je lis ta photo…",
  "photo.cancel": "Annuler",
  "photo.saved": "Photo enregistrée.",
  "photo.already_on_file":
    "Cette photo était déjà là. Rien n’a été enregistré deux fois.",
  "photo.analysis_failed":
    "Ta photo est enregistrée, mais je n’ai pas su la lire cette fois. Rien n’a été noté sur son contenu.",
  "photo.unusable":
    "Ta photo est enregistrée. Je n’ai pas distingué les aliments assez nettement pour en dire quoi que ce soit.",
  "photo.detected_label": "Dans l’assiette",
  "photo.portion_label": "Portion",
  "photo.portion.small": "Plutôt petite",
  "photo.portion.moderate": "Moyenne",
  "photo.portion.large": "Généreuse",
  "photo.portion.unclear": "Difficile à dire sur la photo",
  "photo.verdict_label": "Face à ton plan",
  "photo.verdict.consistent": "Ça colle",
  "photo.verdict.partial": "En partie",
  "photo.verdict.inconsistent": "Ça ne colle pas",
  "photo.verdict.not_visible": "Impossible à dire sur cette photo",
  "photo.low_confidence":
    "Je ne suis pas sûre de cette lecture. Corrige-moi si je me trompe.",
  "photo.energy_label": "Énergie",
  // ⚠️ LE CHIFFRE ET SA BASE DANS LA MÊME LIGNE, jamais dans deux. Une base
  // posée à côté se lit comme une remarque générale; collée au nombre, elle en
  // fait partie.
  "photo.energy.photo_estimate": "environ {kcal} kcal, deviné d’après la photo",
  "photo.energy.declared_quantities":
    "environ {kcal} kcal, d’après les quantités que tu m’as données",
  "photo.no_quantity_note":
    "Une photo me dit ce qu’il y a dans l’assiette, pas quelle quantité. Rien ici n’est une mesure.",
  // La note ci-dessus CONTREDIRAIT un chiffre affiché (« pas quelle
  // quantité »). Celle-ci la remplace dès qu’un chiffre est là, et elle dit la
  // DIRECTION du biais: −26,6 % mesuré, toujours du même côté, pire sur les
  // grosses assiettes. « Une estimation » sans direction laisserait croire à
  // une erreur symétrique, ce qui est le contraire du fait.
  "photo.no_quantity_note_estimate":
    "Ce chiffre est deviné d’après la photo, pas mesuré — et les estimations sur photo tirent vers le bas, d’autant plus sur les grosses assiettes. Prends-le comme un ordre de grandeur.",
  "photo.error": "L’envoi n’a pas abouti. Rien n’a été enregistré — réessaie.",
  "photo.too_large": "Cette image est trop lourde. Essaie une photo plus petite.",
  "photo.unsupported_type": "Ce fichier n’est pas une image JPEG, PNG ou WebP.",

  // ══ LA PHRASE DU COACH (api/labels.ts::commitmentSentence) ═══════════════
  // Une ligne de plan, reconstruite sur un squelette fixe:
  //     QUAND — COMBIEN ( de ) QUOI
  // Tout ce qui suit est un fragment de ce squelette, écrit pour être COMPOSÉ:
  // la plupart sont en minuscules et prennent leur majuscule à l'assemblage.
  //
  // ⚠️ LE FRANÇAIS A DÉPLACÉ DEUX CHOSES DANS CETTE SECTION, et les deux sont
  // des changements de CODE, pas de mot:
  //   · la préposition « de » est passée du gabarit à l'objet
  //     (`food_group.of.*`), parce qu'elle touche le mot qu'elle gouverne;
  //   · l'accord singulier/pluriel est passé de `count === 1` à `plural()`,
  //     parce que le français range 0 avec le singulier.
  // Les deux sont expliqués là où ils vivent (`api/labels.ts`, `i18n/plural.ts`).

  // ⚠️ LES ESPACES DE BORD DE CES DEUX CLÉS SONT PORTEUSES. Elles sont collées
  // à leurs voisines par `join()` et par une concaténation; les rogner souderait
  // les mots. `parity.int.test.ts` les nomme pour cette raison.
  "sentence.separator": " — ",
  "sentence.amount_of": "{amount} {object}",
  // Dit sur CHAQUE ligne d'observation. Un élève qui se croit noté sur un poids
  // ou une humeur commence à cacher les mauvais; le coach lit alors une semaine
  // choisie. Cette incise est toute la défense.
  "sentence.tracked_suffix": " · suivi, pas noté",

  // QUAND — quels jours
  "when.every_day": "Tous les jours",
  "when.weekdays": "En semaine",
  "when.weekends": "Le week-end",
  // « Chaque » et pas « Tous les »: la liste arrive au singulier
  // (« lundi, mercredi et vendredi »), et « Tous les lundi et vendredi » serait
  // faux. « Chaque lundi et vendredi » se lit et reste juste à un seul jour.
  "when.every_named": "Chaque {days}",
  "when.each_week": "Chaque semaine",
  "when.one_day_per_week": "Un jour par semaine",
  "when.days_per_week": "{count} jours par semaine",
  // `required_days_per_week`, dit à voix haute. C'est la différence entre trois
  // portions le dimanche et trois jours séparés — la raison pour laquelle le
  // coach l'a écrit.
  "when.different_days_per_week": "{count} jours différents par semaine",
  "when.at_clock": "à {time}",
  "when.between_clock": "entre {from} et {to}",

  // QUAND — où dans la journée, sur une ligne à faire/à éviter (un ACCOMPAGNEMENT)
  "when.at.on_waking": "au réveil",
  "when.at.breakfast": "au petit-déjeuner",
  "when.at.snack_am": "à la collation du matin",
  "when.at.pre_workout": "avant l’entraînement",
  "when.at.lunch": "au déjeuner",
  "when.at.post_workout": "après l’entraînement",
  "when.at.snack_pm": "à la collation de l’après-midi",
  "when.at.dinner": "au dîner",
  "when.at.before_bed": "au coucher",
  "when.at.any_meal": "à chaque repas",
  "when.at.any_time": "à n’importe quel moment de la journée",

  // QUAND — le même endroit, sur une ligne d'OBSERVATION. « au dîner » se
  // lirait comme une consigne de manger; « chaque soir » se lit comme le moment
  // où l'on note le chiffre, ce qu'est une ligne d'observation.
  "when.observe.on_waking": "au réveil",
  "when.observe.breakfast": "chaque matin au petit-déjeuner",
  "when.observe.snack_am": "chaque matin",
  "when.observe.pre_workout": "avant chaque séance",
  "when.observe.lunch": "chaque midi",
  "when.observe.post_workout": "après chaque séance",
  "when.observe.snack_pm": "chaque après-midi",
  "when.observe.dinner": "chaque soir",
  "when.observe.before_bed": "chaque soir, au coucher",
  "when.observe.any_meal": "à chaque repas",
  "when.observe.any_time": "à n’importe quel moment de la journée",

  // QUAND — le même moment d'observation, DÉPOUILLÉ de sa récurrence, pour les
  // phrases qui impriment déjà une clause de jour. « Chaque samedi, chaque
  // matin au petit-déjeuner » quantifie deux fois une seule récurrence, et la
  // seconde contredit la première.
  "when.moment.on_waking": "au réveil",
  "when.moment.breakfast": "au petit-déjeuner",
  "when.moment.snack_am": "à la collation du matin",
  "when.moment.pre_workout": "avant la séance",
  "when.moment.lunch": "au déjeuner",
  "when.moment.post_workout": "après la séance",
  "when.moment.snack_pm": "à la collation de l’après-midi",
  "when.moment.dinner": "le soir",
  "when.moment.before_bed": "au coucher",
  "when.moment.any_meal": "à chaque repas",
  "when.moment.any_time": "à n’importe quel moment de la journée",

  // COMBIEN
  // « aucun », jamais « 0 »: `polarity='avoid'` avec `presence == 0` est un
  // comparateur dans la base et une prescription sur la page.
  "amount.none": "aucun",
  "amount.at_least": "au moins {quantity}",
  "amount.at_most": "pas plus de {quantity}",
  "amount.between": "{min} à {max}",
  "amount.rate_between": "noter de {min} à {max}",
  // Une cible horaire est un moment, pas une quantité: « pas plus de 2300 » est
  // ce que le nombre devient s'il passe par le chemin des quantités.
  "amount.by_time": "avant {time}",
  "amount.at_time": "à {time}",

  // ── LES UNITÉS COMME MOTS, accordées à leur nombre ───────────────────────
  // ⚠️ L'ACCORD N'EST PAS LE MÊME QU'EN ANGLAIS, et c'est la seule divergence
  // des deux langues livrées: « 0 days » là-bas, « 0 jour » ici. La bascule vit
  // dans `i18n/plural.ts`; ces tables n'en savent rien, elles portent juste les
  // deux formes.
  //
  // Les symboles (mg, kcal, km) sont identiques dans les deux formes ET dans
  // les deux langues: ce sont des symboles internationaux, pas des mots.
  // `parity.int.test.ts` les nomme un par un plutôt que de tolérer un seuil.
  "unit.one.kcal": "kcal",
  "unit.many.kcal": "kcal",
  "unit.one.g": "g",
  "unit.many.g": "g",
  "unit.one.mg": "mg",
  "unit.many.mg": "mg",
  // « µg » et pas « mcg »: c'est le symbole SI, celui des étiquettes et des
  // ordonnances françaises.
  "unit.one.mcg": "µg",
  "unit.many.mcg": "µg",
  // Unités Internationales.
  "unit.one.IU": "UI",
  "unit.many.IU": "UI",
  "unit.one.ml": "ml",
  "unit.many.ml": "ml",
  "unit.one.l": "L",
  "unit.many.l": "L",
  "unit.one.min": "minute",
  "unit.many.min": "minutes",
  "unit.one.h": "heure",
  "unit.many.h": "heures",
  "unit.one.km": "km",
  "unit.many.km": "km",
  "unit.one.kg": "kg",
  "unit.many.kg": "kg",
  "unit.one.capsule": "capsule",
  "unit.many.capsule": "capsules",
  "unit.one.tablet": "comprimé",
  "unit.many.tablet": "comprimés",
  "unit.one.scoop": "dosette",
  "unit.many.scoop": "dosettes",
  "unit.one.portion": "portion",
  "unit.many.portion": "portions",
  // ⚠️ `serving` ET `portion` TOMBENT SUR LE MÊME MOT, ET C'EST VOULU.
  // L'anglais distingue la portion servie de la portion de référence; le
  // français n'a qu'un mot pour les deux, et en inventer un second (« part »,
  // déjà pris par la part d'un membre du foyer) créerait une distinction que
  // personne ne lit. Les JETONS restent distincts, eux.
  "unit.one.serving": "portion",
  "unit.many.serving": "portions",
  "unit.one.rep": "répétition",
  "unit.many.rep": "répétitions",
  "unit.one.session": "séance",
  "unit.many.session": "séances",
  "unit.one.celsius": "C",
  "unit.many.celsius": "C",
  "unit.one.point": "point",
  "unit.many.point": "points",
  // ⚠️ CES QUATRE VIDES SONT PORTEURS. `quantity()` teste exactement `word ===
  // ""` pour décider de n'imprimer que le nombre: une unité d'horloge n'a pas
  // de mot (« 23:00 minute » n'existe pas) et l'unité `none` non plus. Les
  // remplir imprimerait un mot que la phrase ne demande pas.
  "unit.one.hhmm": "",
  "unit.many.hhmm": "",
  "unit.one.none": "",
  "unit.many.none": "",

  // ── Les jours, forme longue (« Chaque lundi et vendredi ») ───────────────
  // En minuscules: un nom de jour ne prend pas de majuscule en français, et
  // c'est `when.every_named` qui ouvre la phrase.
  "day.long.mon": "lundi",
  "day.long.tue": "mardi",
  "day.long.wed": "mercredi",
  "day.long.thu": "jeudi",
  "day.long.fri": "vendredi",
  "day.long.sat": "samedi",
  "day.long.sun": "dimanche",

  // ── Les jours, forme courte ──────────────────────────────────────────────
  "day.mon": "Lun",
  "day.tue": "Mar",
  "day.wed": "Mer",
  "day.thu": "Jeu",
  "day.fri": "Ven",
  "day.sat": "Sam",
  "day.sun": "Dim",

  // ── Les groupes d'aliments ───────────────────────────────────────────────
  // Le mot, en milieu de phrase, en minuscules.
  "food_group.lean_protein": "protéines",
  "food_group.fatty_fish": "poissons gras",
  "food_group.white_fish": "poissons blancs",
  "food_group.shellfish": "fruits de mer",
  "food_group.poultry": "volaille",
  "food_group.red_meat": "viande rouge",
  "food_group.eggs": "œufs",
  "food_group.legumes": "légumineuses",
  "food_group.tofu_tempeh": "tofu ou tempeh",
  "food_group.dairy_yogurt": "yaourt",
  "food_group.dairy_cheese": "fromage",
  "food_group.whole_grain": "céréales complètes",
  "food_group.refined_grain": "céréales raffinées",
  "food_group.starchy_veg": "légumes féculents",
  "food_group.cruciferous_veg": "crucifères",
  "food_group.leafy_greens": "légumes-feuilles",
  "food_group.non_starchy_veg": "légumes",
  "food_group.berries": "fruits rouges",
  "food_group.citrus": "agrumes",
  "food_group.other_fruit": "fruits",
  "food_group.nuts_seeds": "fruits à coque et graines",
  "food_group.olive_oil": "huile d’olive",
  "food_group.other_added_fat": "matières grasses ajoutées",
  "food_group.sauce_dressing": "sauces et vinaigrettes",
  "food_group.sugar_sweets": "sucre et sucreries",
  "food_group.fried_food": "fritures",
  "food_group.alcohol": "alcool",
  "food_group.sweetened_beverage": "boissons sucrées",
  "food_group.water": "eau",
  "food_group.coffee_tea": "café ou thé",

  // ── Les mêmes groupes, APRÈS UNE QUANTITÉ ────────────────────────────────
  // C'EST CETTE TABLE QUI A FAIT DÉPLACER LE « of » HORS DU GABARIT. Trois
  // choses qu'aucune règle mécanique ne produit ensemble:
  //   · l'élision devant voyelle — « d’œufs », « d’agrumes », « d’alcool »;
  //   · l'élision devant un h MUET — « d’huile d’olive » — alors qu'un h aspiré
  //     ne s'élide pas (« de haricots »), et rien dans le mot ne le dit;
  //   · le redoublement à l'intérieur d'un groupe composé — « de fruits à coque
  //     et DE graines », « de sauces et DE vinaigrettes ».
  "food_group.of.lean_protein": "de protéines",
  "food_group.of.fatty_fish": "de poissons gras",
  "food_group.of.white_fish": "de poissons blancs",
  "food_group.of.shellfish": "de fruits de mer",
  "food_group.of.poultry": "de volaille",
  "food_group.of.red_meat": "de viande rouge",
  "food_group.of.eggs": "d’œufs",
  "food_group.of.legumes": "de légumineuses",
  "food_group.of.tofu_tempeh": "de tofu ou de tempeh",
  "food_group.of.dairy_yogurt": "de yaourt",
  "food_group.of.dairy_cheese": "de fromage",
  "food_group.of.whole_grain": "de céréales complètes",
  "food_group.of.refined_grain": "de céréales raffinées",
  "food_group.of.starchy_veg": "de légumes féculents",
  "food_group.of.cruciferous_veg": "de crucifères",
  "food_group.of.leafy_greens": "de légumes-feuilles",
  "food_group.of.non_starchy_veg": "de légumes",
  "food_group.of.berries": "de fruits rouges",
  "food_group.of.citrus": "d’agrumes",
  "food_group.of.other_fruit": "de fruits",
  "food_group.of.nuts_seeds": "de fruits à coque et de graines",
  "food_group.of.olive_oil": "d’huile d’olive",
  "food_group.of.other_added_fat": "de matières grasses ajoutées",
  "food_group.of.sauce_dressing": "de sauces et de vinaigrettes",
  "food_group.of.sugar_sweets": "de sucre et de sucreries",
  "food_group.of.fried_food": "de fritures",
  "food_group.of.alcohol": "d’alcool",
  "food_group.of.sweetened_beverage": "de boissons sucrées",
  "food_group.of.water": "d’eau",
  "food_group.of.coffee_tea": "de café ou de thé",

  // ── Les substances ───────────────────────────────────────────────────────
  // Nomenclature internationale: une bonne part s'écrit à l'identique, et
  // inventer une différence serait pire qu'un mot recopié.
  "substance.vitamin_d3": "vitamine D3",
  "substance.omega3_epa_dha": "oméga-3 (EPA+DHA)",
  "substance.magnesium_glycinate": "glycinate de magnésium",
  "substance.iron_bisglycinate": "bisglycinate de fer",
  "substance.creatine_monohydrate": "créatine monohydrate",
  "substance.vitamin_k2": "vitamine K2",
  "substance.methylfolate": "méthylfolate",
  "substance.zinc": "zinc",
  "substance.copper": "cuivre",
  "substance.curcumin": "curcumine",
  "substance.piperine": "pipérine",
  "substance.alcohol": "alcool",
  "substance.caffeine": "caféine",
  "substance.gluten": "gluten",
  "substance.st_johns_wort": "millepertuis",
  "substance.melatonin": "mélatonine",
  "substance.ashwagandha": "ashwagandha",
  "substance.berberine": "berbérine",
  "substance.vitamin_c": "vitamine C",
  "substance.vitamin_a": "vitamine A",
  "substance.vitamin_e": "vitamine E",
  "substance.vitamin_b12": "vitamine B12",
  "substance.niacin": "niacine",
  "substance.selenium": "sélénium",
  "substance.iodine": "iode",
  "substance.calcium_citrate": "citrate de calcium",
  "substance.potassium": "potassium",
  "substance.omega3_epa": "oméga-3 EPA",
  "substance.omega3_dha": "oméga-3 DHA",
  "substance.collagen": "collagène",
  "substance.whey_protein": "protéine de lactosérum",
  "substance.casein": "caséine",
  "substance.fiber_psyllium": "fibres de psyllium",
  "substance.probiotic": "probiotique",
  "substance.coq10": "CoQ10",
  "substance.nac": "NAC",
  "substance.glycine": "glycine",
  "substance.taurine": "taurine",
  "substance.electrolytes": "électrolytes",
  "substance.sodium_chloride": "sel",

  // ── Les questions posées au coach ────────────────────────────────────────
  // Ce qui vivait là était le SQL: « plan_commitments_target_check:
  // target_op='<=' requires target_max ». Un coach ne peut rien en faire, et ne
  // devrait jamais apprendre qu'une telle phrase existe.
  "question.section": "À décider",
  "question.when": "À quel moment de la journée ?",
  "question.how_much": "Combien, exactement ?",
  "question.time": "À quelle heure ?",
  "question.window": "Entre quelles heures ?",
  "question.title": "Qu’est-ce que cette ligne ? Elle n’a pas encore de nom.",
  "question.which_supplement": "De quel complément s’agit-il ?",
  "question.day_or_week": "Est-ce une règle quotidienne ou hebdomadaire ?",
  "question.how_many_days": "Combien de jours par semaine ?",
  "question.how_many_times": "Combien de fois par jour ?",
  // Le repli honnête. Mieux qu'un nom de contrainte, et il dit de qui vient le
  // problème: on n'a pas su lire la ligne, donc on la redemande.
  "question.unreadable": "Je n’ai pas su lire cette ligne — peux-tu la réécrire ?",
  "question.slot_placeholder": "Choisis un moment",

  // ── Le vocabulaire des créneaux (slot_vocabulary.label_i18n_key) ─────────
  "slot.on_waking": "Au réveil",
  "slot.breakfast": "Petit-déjeuner",
  "slot.snack_am": "Collation du matin",
  "slot.pre_workout": "Avant l’entraînement",
  "slot.lunch": "Déjeuner",
  "slot.post_workout": "Après l’entraînement",
  "slot.snack_pm": "Collation de l’après-midi",
  "slot.dinner": "Dîner",
  "slot.before_bed": "Au coucher",
  "slot.any_meal": "N’importe quel repas",
  "slot.any_time": "N’importe quand",

  // ── D'où vient le fait (protocol_events.source) ──────────────────────────
  "event.source.photo": "Photo",
  "event.source.text": "Écrit",
  "event.source.voice": "Voix",
  // « Conversation » et pas « Chat »: en français le mot désigne un animal.
  "event.source.chat": "Conversation",
  "event.source.quick_tap": "Tapé dans l’app",
  "event.source.integration": "Appareil",
  "event.source.coach_entry": "Saisi par le coach",

  // ── L'état d'une évaluation (commitment_evaluations.status) ──────────────
  "status.unknown": "Pas encore enregistré",
  "status.met": "Fait",
  "status.partial": "En partie",
  "status.missed": "Manqué",
  "status.not_applicable": "Non compté",
  "status.flex_used": "Souplesse utilisée",

  // ── L'horaire d'une évaluation ───────────────────────────────────────────
  "timing.on_time": "À l’heure",
  "timing.off_window": "Fait, hors de la fenêtre prévue",
  "timing.unknown": "Horaire inconnu",
  "timing.not_applicable": "Pas d’horaire",

  // ── La priorité d'une ligne ──────────────────────────────────────────────
  "priority.core": "Essentiel",
  "priority.secondary": "Secondaire",
  "priority.optional": "Facultatif",

  // ── LES DEUX PARTIES D'UN PLAN (+ ce qui n'est que regardé) ──────────────
  // Les titres que le coach lit au-dessus de son propre plan, et ceux que
  // l'élève lit au-dessus de sa journée. La PARTITION est la même des deux
  // côtés — c'est le vocabulaire qui change, pas le rangement.
  "part.food": "Alimentation",
  "part.actions": "Actions",
  "part.observations": "Observations",
  "part.unsorted": "Pas encore classé",
  "part.hint.food": "Ce que ton client mange — repas, aliments et compléments.",
  "part.hint.actions":
    "Ce que ton client fait — mouvement, sommeil, lumière, récupération.",
  "part.hint.observations":
    "Suivi, pas noté. Ce que ton client relève pour toi — jamais une consigne à tenir, donc jamais comptée comme telle.",
  "part.hint.unsorted":
    "Nous n’avons pas su dire de quoi il s’agit. Ouvres-en une et dis-le.",

  // Les mêmes trois parties, dites à l'élève.
  "part.student.food": "Ce que je mange",
  "part.student.actions": "Ce que je fais",
  "part.student.observations": "Ce que je note",
  "part.student.unsorted": "Pas encore classé",
  "part.student.hint.food": "Dans l’ordre de ta journée.",
  "part.student.hint.actions": "Mouvement, sommeil, lumière, récupération.",
  "part.student.hint.observations": "Suivi, pas noté.",
  "part.student.hint.unsorted": "Ton coach n’a pas encore dit ce que c’est.",

  // ── Dans ALIMENTATION — les intertitres du coach, pas nos colonnes ───────
  "food_section.every_day": "Chaque jour",
  "food_section.every_week": "Chaque semaine",
  "food_section.cutting": "Ce qu’on réduit",
  "food_section.supplements": "Compléments",

  // ── La classe d'activité (plan_commitments.activity_class) ───────────────
  "activity.nutrition": "Nutrition",
  "activity.supplement": "Complément",
  "activity.movement": "Mouvement",
  "activity.recovery": "Récupération",
  "activity.exposure": "Exposition",
  "activity.sleep": "Sommeil",
  "activity.mind": "Mental",
  "activity.measurement": "Mesure",
  "activity.other": "Autre",

  // ── L'autonomie laissée par une ligne ────────────────────────────────────
  // Dite comme une phrase, pas comme le slug: le coach qui choisit ici répond à
  // « à quel point peut-il changer ? ».
  "autonomy.strict": "Exactement comme écrit",
  "autonomy.swap_within_policy": "Échanges autorisés, dans le cadre ci-dessous",
  "autonomy.flexible": "À sa discrétion",

  // ── Les unités en pastille (plan_commitments.unit) ───────────────────────
  // Le stockage reste en SI (R4); ce sont des libellés d'affichage. Forme
  // ABRÉGÉE, à côté d'un nombre dans un tableau — la forme en toutes lettres
  // est au-dessus, dans les tables `unit.one.*` / `unit.many.*`.
  "unit.kcal": "kcal",
  "unit.g": "g",
  "unit.mg": "mg",
  "unit.mcg": "µg",
  "unit.IU": "UI",
  "unit.ml": "ml",
  "unit.l": "L",
  "unit.min": "min",
  "unit.h": "h",
  "unit.km": "km",
  "unit.kg": "kg",
  "unit.cm": "cm",
  "unit.capsule": "capsule",
  "unit.tablet": "comprimé",
  "unit.scoop": "dosette",
  "unit.portion": "portion",
  "unit.serving": "portion",
  "unit.rep": "rép",
  "unit.session": "séance",
  "unit.celsius": "C",
  "unit.point": "point",
  "unit.hhmm": "heure",
  // Le vide est PORTEUR: `unitLabel` le rend tel quel pour l'unité `none`, et
  // `targetLabel` teste cette chaîne pour ne pas coller un espace au nombre.
  "unit.none": "",

  // ── Déclarer un écart (planned_deviations) ───────────────────────────────
  // De plein droit, jamais un aveu.
  "deviation.title": "Déclarer un écart",
  "deviation.subtitle":
    "Un restaurant, un voyage, un repas de famille. Dis-le avant que ça arrive : le créneau sort du décompte au lieu de compter zéro. Ça fait partie du plan, ce n’est pas un échec.",
  "deviation.kind_label": "Ce qui arrive",
  "deviation.kind.restaurant": "Repas dehors",
  "deviation.kind.social": "Événement",
  "deviation.kind.travel": "Déplacement",
  "deviation.kind.family": "Repas de famille",
  "deviation.kind.work": "Contrainte de travail",
  "deviation.kind.other": "Autre chose",
  "deviation.when_label": "Quand",
  "deviation.when_today": "Aujourd’hui",
  "deviation.when_tomorrow": "Demain",
  "deviation.slot_label": "Quel créneau",
  "deviation.slot_all_day": "Toute la journée",
  "deviation.note_label": "Ce que ton coach devrait savoir",
  "deviation.note_placeholder":
    "Facultatif. Tes mots, gardés tels que tu les écris.",
  "deviation.submit": "Déclarer",
  "deviation.submitting": "Déclaration…",
  "deviation.declared": "Déclaré : {kind} le {date}.",
  "deviation.error":
    "L’enregistrement n’a pas abouti. Rien n’a été déclaré — réessaie.",

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 3 — LA COQUILLE DE L'APP CONNECTÉE
  //
  // `KeelAppShell` entoure chaque écran d'élève et de coach. Ces douze mots
  // sont ce qu'on lit AUTOUR de tout le reste; tant qu'ils étaient anglais,
  // aucune page d'app ne pouvait basculer sans être cousue.
  // ══════════════════════════════════════════════════════════════════════════
  "shell.nav.students": "Élèves",
  "shell.nav.templates": "Modèles",
  // « Aliments recommandés » et pas « Méthode »: l'écran ne demande plus une
  // posture sur des groupes abstraits, il demande les ALIMENTS avec lesquels le
  // coach construit.
  "shell.nav.protocol": "Aliments recommandés",
  "shell.nav.doctrine": "Doctrine",
  // La bibliothèque de recettes, pas les repas de l'élève.
  "shell.nav.meals": "Recettes",
  "shell.nav.weekly": "Cette semaine",
  "shell.nav.account": "Compte",
  "shell.nav.legal": "Mentions légales",
  "shell.nav.sign_out": "Se déconnecter",
  "shell.nav.menu": "Menu",
  "shell.nav.menu_close": "Fermer",
  "shell.nav.primary": "Sections principales",

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 3 — LA BULLE
  //
  // ⚠️ ELLE ENTRE PAR LA COQUILLE AUTANT QUE PAR SA PAGE: `KeelAppShell` rend
  // `chat.title` (le titre de la notification) et `chat.unread.aria` (le
  // libellé de la pastille) sur TOUS les écrans élève. Traduire la coquille
  // sans la bulle aurait laissé deux chaînes anglaises dans la barre.
  // ══════════════════════════════════════════════════════════════════════════
  "chat.title": "Sophia",
  "chat.subtitle": "Ton quotidien, avec la méthode de ton coach derrière.",
  "chat.empty":
    "Rien ici pour l’instant. Dis bonjour, ou envoie une photo de ton prochain repas.",
  "chat.input.placeholder": "Écrire à Sophia",
  "chat.send": "Envoyer",
  "chat.thinking": "Sophia écrit…",
  "chat.history.more": "Charger les messages précédents",
  "chat.history.loading": "Chargement…",
  "chat.error.send": "Le message n’est pas parti. Réessaie.",
  // Honnête plutôt que rassurant: on dit que la livraison instantanée est
  // tombée ET que rien n'est perdu, parce que les deux sont vrais.
  "chat.status.offline":
    "Les mises à jour en direct sont coupées — les messages arrivent quand même, juste plus lentement.",
  // Le libellé est le MÊME pour les trois messages qui partent sans qu'on ait
  // rien demandé: il dit qui a ouvert la bouche, pas pourquoi.
  "chat.proactive.label": "Sophia a écrit la première",
  "chat.unread.aria": "Messages non lus de Sophia : {count}",
  "chat.settings.toggle": "Notifications",
  "chat.settings.checkins.label": "Les nouvelles de Sophia",
  // La seconde phrase n'est pas du confort: couper ne coupe QUE le proactif.
  // Ne pas le dire ferait croire qu'on se coupe de Sophia.
  "chat.settings.checkins.help":
    "Le point du soir, le bilan du dimanche, et un mot si tu disparais. Elle répond toujours quand tu écris, quoi que dise ce réglage.",
  "chat.settings.notify.label": "Me prévenir sur cet appareil",
  "chat.settings.notify.help":
    "Une notification système quand elle écrit la première et que cet onglet n’est pas devant.",
  "chat.settings.notify.blocked":
    "Ton navigateur bloque les notifications pour ce site — autorise-les là-bas d’abord.",
  "chat.settings.notify.unsupported":
    "Ce navigateur ne sait pas afficher de notifications.",
  "chat.photo.label": "Photo",
  "chat.photo.sending": "Envoi d’une photo…",
  "chat.photo.error.type":
    "Ce type de fichier n’est pas accepté — envoie un JPEG, un PNG ou un WebP.",
  "chat.photo.error.size": "Cette photo est trop lourde. Essaie-en une plus petite.",
  // Une photo choisie ATTEND dans le composeur au lieu de partir seule: le mot
  // qui l'accompagne se tape après l'avoir choisie, jamais avant.
  "chat.photo.attached": "Photo prête à partir",
  "chat.photo.remove": "Retirer",
  "chat.photo.caption.placeholder": "Dis-en un mot (facultatif)",

  "chat.weekly.title": "Comment la semaine s’est vraiment passée",
  "chat.weekly.subtitle":
    "Six lectures rapides. Deux minutes, et rien ici n’est noté.",
  // R4 — le sous-titre du dimanche POIDS SEUL. Sans lecteur humain, l'écran se
  // réduit aux deux mesures, et « six lectures » annoncerait quatre questions
  // qu'on a décidé de ne pas poser.
  "chat.weekly.subtitle.measures":
    "Deux nombres, si tu les suis. Rien ici n’est noté.",
  "chat.weekly.optional": "Facultatif — seulement si tu les suis.",
  "chat.weekly.weight": "Poids (kg)",
  "chat.weekly.waist": "Tour de taille (cm)",
  "chat.weekly.submit": "Envoyer",
  "chat.weekly.cancel": "Pas maintenant",
  "chat.weekly.error.empty":
    "Donne une note à l’une des six, ou remplis un nombre.",
  "chat.weekly.error.empty.measures": "Remplis au moins l’un des deux.",
  "chat.weekly.error.number": "{field} doit être un nombre.",
  // Hors bornes = refusé et NOMMÉ, jamais ramené au bord: une valeur corrigée
  // en silence est une donnée fausse qui a l'air vraie.
  "chat.weekly.error.range": "{field} doit être entre {min} et {max}.",

  // ══ FF-062 C2 — LE RAPPEL DE PESÉE ══════════════════════════════════════
  //
  // ⚠️ LE PLACEHOLDER DU CHAMP PORTE LE DERNIER POIDS, ET C'EST R8. Il n'a PAS
  // de clé: c'est un NOMBRE, formaté par `formatNumber`. Le champ
  // reste VIDE: un champ pré-rempli se valide sans être lu, et on
  // enregistrerait la valeur de l'avant-veille comme une pesée d'aujourd'hui.
  "chat.weighin.title": "Ton poids",
  "chat.weighin.subtitle": "Un chiffre. C’est là-dessus que ton plan est calibré.",
  "chat.weighin.field": "Poids (kg)",
  "chat.weighin.submit": "Enregistrer",
  "chat.weighin.cancel": "Pas maintenant",
  "chat.weighin.error.empty":
    "Rien n’a été saisi — tape un poids, ou reviens plus tard.",
  "chat.weighin.error.number": "Ça doit être un nombre.",
  "chat.weighin.error.range": "Un poids doit être entre {min} et {max} kg.",
  // FF-062 C1 — le créneau qu'une question de repas a NOMMÉ, et que la photo
  // suivante portera. Affiché parce qu'un créneau forcé invisible est un état
  // caché qui décide d'un fait.
  "chat.slotmeal.forced": "Cette photo sera enregistrée pour : {slot}",
  // Les six moments, DANS le namespace `chat` — voir `api/slotMeal.ts`.
  "chat.slotmeal.slot.breakfast": "le petit-déjeuner",
  "chat.slotmeal.slot.snack_am": "ta collation du matin",
  "chat.slotmeal.slot.lunch": "le déjeuner",
  "chat.slotmeal.slot.snack_pm": "ton goûter",
  "chat.slotmeal.slot.dinner": "le dîner",
  "chat.slotmeal.slot.before_bed": "ta collation du soir",

  // ══ FF-062 R11 — LE CHIFFRE D'ÉNERGIE, CORRIGÉ ══════════════════════════
  //
  // ⚠️ LE PLACEHOLDER PORTE LE CHIFFRE ACTUEL, ET LE CHAMP RESTE VIDE — un
  // champ pré-rempli validé sans être lu réécrirait le chiffre DEVINÉ en le
  // faisant passer pour une déclaration.
  "chat.kcalfix.title": "Le chiffre",
  "chat.kcalfix.subtitle": "Remplace-le par ce que tu sais.",
  "chat.kcalfix.field": "kcal",
  "chat.kcalfix.submit": "Enregistrer",
  "chat.kcalfix.cancel": "Laisser",
  "chat.kcalfix.error.empty": "Rien n’a été saisi — le chiffre reste tel quel.",
  "chat.kcalfix.error.number": "Ça doit être un nombre.",
  "chat.kcalfix.error.range": "Un repas doit être entre {min} et {max} kcal.",
  // ── LES SIX AXES ET LES CINQ CRANS ──────────────────────────────────────
  // ⚠️ L'ANGLAIS DE CES ONZE CLÉS EST SOUS CONTRAT AVEC UN FICHIER DENO
  // (`weekly_flow.ts`, comparé mot pour mot par un test). Le FRANÇAIS, lui, est
  // libre: les constantes serveur ne servent que des consignes de modèle et un
  // formulaire Meta hérité, jamais un écran d'élève. Voir la note d'`en.ts`.
  //
  // L'article défini sur chaque axe (« l’énergie », « la faim ») et pas le nom
  // nu: la question posée est « comment ça s’est passé », et une liste de noms
  // nus se lirait comme un questionnaire clinique.
  "chat.weekly.axis.energy": "L’énergie au quotidien",
  "chat.weekly.axis.hunger": "La faim entre les repas",
  "chat.weekly.axis.sleep": "La qualité du sommeil",
  "chat.weekly.axis.digestion": "La digestion",
  "chat.weekly.axis.mood": "L’humeur",
  "chat.weekly.axis.training": "La qualité des séances",
  "chat.weekly.scale.1": "1 — mauvais",
  "chat.weekly.scale.2": "2 — médiocre",
  "chat.weekly.scale.3": "3 — correct",
  "chat.weekly.scale.4": "4 — bien",
  "chat.weekly.scale.5": "5 — très bien",
  // ══ LE MOTEUR DE REPAS (lot 4) ═══════════════════════════════════════════
  // Le catalogue parallèle d'`api/mealLabels.ts` a rejoint le seed, et c'est ce
  // qui débloque `/app/meals`, `/app/health`, `/app/household`, `/app/plan` et
  // `/app/today` d'un seul geste: les cinq écrans montaient les mêmes phrases.
  //
  // ── LE MOT « FOURNÉE » ────────────────────────────────────────────────────
  // « Batch » n'a pas de traduction unique en français de cuisine. Les pages de
  // vente gardent « batch cooking » parce que c'est le terme que ce public
  // cherche; À L'INTÉRIEUR du produit, la phrase parle d'une casserole précise
  // (« la fournée cuisinée dimanche »), et « fournée » est le mot français
  // exact pour ce qu'on fait cuire en une fois. Les deux choix sont
  // volontairement différents, et ils ne se croisent nulle part à l'écran.
  "meals.result.in_pantry": "Tu l’as déjà",
  // Seulement quand le plat puise dans un lot: sans lot, ces ingrédients sont la
  // recette entière et ce titre affirmerait un lot qui n'existe pas.
  "meals.result.extra_ingredients": "En plus du lot",
  "meals.result.method": "Comment",
  // « Comment » ouvre une recette; ceci ouvre un GESTE — réchauffer, trancher,
  // ajouter la salade. Deux mots parce que ce sont deux choses.
  "meals.result.assemble": "Au moment de servir",
  // ── LA SESSION D'OÙ CE PLAT TIRE SON LOT (2026-08-14) ───────────────────
  "meals.result.thaw_the_night_before":
    "Part congelée : sors-la du congélateur la veille au soir.",
  "meals.result.session_open": "La session de cuisine",
  "meals.result.session_hide": "Masquer la session",
  "meals.result.session_also": "Fait dans la même session : {titles}",
  "meals.result.today": "Aujourd’hui",
  "meals.result.past": "Passé",
  // ── LOT 1 (2026-08-17) · LA VUE PAR JOUR ────────────────────────────────
  "meals.result.day_all": "Toute la semaine",
  "meals.result.day_rail": "Lire un jour",
  "meals.result.day_session": "Session de cuisine",
  "meals.result.day_session_show": "Voir le déroulé",
  "meals.result.day_session_hide": "Masquer le déroulé",
  "meals.result.day_groceries_one": "Les courses du jour — 1 article",
  "meals.result.day_groceries_many": "Les courses du jour — {n} articles",
  "meals.result.day_groceries_show": "Voir la liste",
  "meals.result.day_groceries_hide": "Masquer la liste",
  "meals.result.day_nothing": "Rien à cuisiner ni à acheter ce jour-là.",
  "meals.day_person.table": "Pour la table",
  "meals.day_person.member": "Pour {name}",
  "meals.day_person.members": "Pour {names}",
  "meals.day_person.marks_label": "Qui mange ce plat",
  "meals.grid.title": "Ta semaine d’un coup d’œil",
  "meals.grid.from_batch": "d’une fournée",
  "meals.grid.own_one": "+1 à part",
  "meals.grid.own_many": "+{n} à part",
  "meals.grid.own_only": "rien pour la table",
  "meals.grid.extra_one": "+1 plat de plus",
  "meals.grid.extra_many": "+{n} plats de plus",
  "meals.grid.away": "tu manges ailleurs",
  "meals.grid.eating_out": "repas dehors",
  "meals.grid.leftovers": "restes",
  "meals.grid.empty": "rien ici",
  "meals.grid.empty_hint":
    "Rien n’a été composé pour ce moment, et tu n’as pas demandé à le sauter.",
  "meals.kitchen.title": "Ce que tu cuisines",
  "meals.kitchen.cook_on": "à cuisiner {day}",
  "meals.kitchen.feeds": "couvre {days}",
  "meals.sessions.title": "Tes sessions de cuisine",
  "meals.sessions.subtitle":
    "Cuisine ces jours-là, et le reste de la semaine s’assemble au lieu de se cuisiner.",
  "meals.sessions.makes": "— {n} portions",
  "meals.sessions.makes_one": "— {n} portion",
  // ⚠️ « Boxing » N'EST PAS TRADUIT, ET C'EST UNE DÉCISION DU 2026-08-20. C'est
  // le nom que le produit donne au geste; « Mise en boîtes » d'un côté et
  // « Boxing » de l'autre feraient deux noms pour la même chose entre une
  // capture d'écran et une phrase de support.
  "meals.boxes.title": "Boxing",
  // Sur la carte d'un PLAT: pas une pesée — elle a eu lieu à la session —, mais
  // les bacs à aller chercher dans le frigo.
  "meals.boxes.title_dish": "Les boîtes à sortir",
  "meals.dish.who_eats": "Qui mange ça",
  // Le compte est en tête: on sort ses bacs avant de commencer, pas au milieu.
  "meals.boxes.count_one": "1 contenant à remplir",
  "meals.boxes.count_many": "{n} contenants à remplir",
  // De quel gramme on parle, une fois pour tout le bloc. Juste au-dessus, les
  // casseroles affichent du CRU pour la fournée entière; sans cette ligne, les
  // deux séries de nombres se lisent comme une contradiction.
  "meals.boxes.ready_not_raw":
    "Grammes d’aliment cuit, par contenant. Les quantités des casseroles, plus haut, sont celles du cru, pour toute la fournée.",
  // ⛔ Ce qui dit que le nombre décrit un BAC et non une personne. Seulement sur
  // un contenant à plusieurs noms: à un seul nom, la boîte EST la portion.
  "meals.boxes.for_n": "· pour {n}",
  // Au-delà de quatre prénoms, le couvercle dit combien ils sont.
  "meals.boxes.rest_of_table": "Le reste de la table ({n})",
  // Le couvercle sans nom: un plan relu sans ses parts n'a aucun prénom à
  // joindre, et l'instruction de pesée reste vraie sans lui.
  "meals.boxes.lid_unnamed": "Un contenant",
  "meals.boxes.grams": "{n} g",
  // Les deux nombres restent DEUX nombres. « 10 min aux fourneaux » décide si
  // on s’y met ce soir, « 50 min en tout » décide si on a la fenêtre.
  "meals.sessions.session_time": "environ {n} min",
  "meals.sessions.active": "{n} min aux fourneaux",
  "meals.sessions.total": "{n} min en tout",
  "meals.sessions.recipe_show": "La recette",
  "meals.sessions.recipe_hide": "Masquer la recette",
  "meals.picker.title": "Quels repas, quels jours",
  "meals.picker.subtitle":
    "Tout ce que tu as déclaré est actif. Décoche un repas que tu ne prendras " +
    "pas à la maison — rien n’est cuisiné pour lui, et rien n’est acheté.",
  "meals.picker.meal": "Repas",
  "meals.picker.all_on": "Tous les repas sont actifs. Décoche ceux où tu manges ailleurs.",
  "meals.picker.some_off_one": "{n} repas décoché. Il revient la prochaine fois si tu le recoches.",
  "meals.picker.some_off_many": "{n} repas décochés. Ils reviennent la prochaine fois si tu les recoches.",
  "meals.picker.state_at_table": "Ici, à table",
  "meals.picker.state_eating_out": "Dehors",
  "meals.picker.state_away": "Pas là",
  "meals.picker.some_out_one":
    "Dont {n} repas dehors : il sort du plan, pas de la journée.",
  "meals.picker.some_out_many":
    "Dont {n} repas dehors : ils sortent du plan, pas de la journée.",
  // Voir la note de `en.ts` : on NOMME ce que la fenêtre ne montre pas, on ne
  // l'additionne pas au compteur des cases visibles.
  "meals.picker.some_out_hidden_one":
    "1 autre est coché un jour que ce plan ne couvre pas. Il le reste.",
  "meals.picker.some_out_hidden_many":
    "{n} autres sont cochés des jours que ce plan ne couvre pas. Ils le restent.",
  // ⚠️ LA CITATION DOIT SUIVRE LE TITRE DE LA CARTE. Ces guillemets nomment
  // `rhythm.title` (`EatingRhythmCard`): si l’un des deux change de mots,
  // l’élève cherche à l’écran une section qui n’existe pas sous ce nom.
  "meals.picker.no_rhythm":
    "Règle d’abord les moments où tu manges dans « Comment se passe ta journée » — " +
    "cette grille est construite à partir d’eux.",
  "meals.picker.open": "Choisir les repas",
  "meals.picker.save": "Enregistrer",
  // Trois points de suspension pendant l’enregistrement: identique à l’anglais
  // parce que ce n’est pas un mot. Inscrit dans la liste d’exceptions de
  // `parity.int.test.ts`.
  "meals.picker.saving": "…",
  "meals.picker.cancel": "Annuler",
  "meals.today.title": "Côté cuisine",
  "meals.today.cook_today": "Tu cuisines aujourd’hui",
  "meals.today.cook_tomorrow": "Tu cuisines demain",
  "meals.today.shop_today": "Jour de courses",
  "meals.today.shop_tomorrow": "Courses demain",
  "meals.today.shop_on": "Courses {day}",
  "meals.today.shop_overdue": "Les courses étaient prévues {day}",
  "meals.today.shop_items": "{n} articles sur la liste",
  "meals.today.shop_open": "Ouvrir la liste",
  "meals.today.sessions_open": "Voir la semaine",
  "meals.today.makes": "Tu prépares {titles}",
  // FF-057 — voir le commentaire côté `en.ts` : le libellé énonce un fait, il
  // ne fait pas avouer. « Je n'ai pas fait cette cuisson », jamais « j'ai raté ».
  "meals.today.session_missed": "Je n’ai pas fait cette cuisson",
  "meals.today.session_missed_busy": "Envoi…",
  "meals.today.session_missed_failed":
    "Ça n’est pas parti. Réessaie, ou dis-le à Sophia dans la conversation.",
  "meals.today.assembling": "Rien à cuisiner aujourd’hui — aujourd’hui, on assemble.",
  "meals.result.from_prep": "Depuis {title} — cuisiné {day}.",
  "meals.result.batch_makes": "Cuisiné une seule fois — {n} portions",
  "meals.result.batch_covers": "couvre {days}",
  "meals.result.from_batch": "De la fournée cuisinée {day} — réchauffe une portion.",
  // ── LOT 2 · LE GESTE DU JOUR J, DIT PAR SON JETON ──────────────────────
  // Des instructions de cuisine, jamais un jugement, et aucune raison à côté.
  // « Rien à préparer » rend le jeton `none` — une affirmation du moteur; un
  // plat dont le geste n’a pas été déclaré n’affiche RIEN.
  "meals.same_day.none": "Rien à préparer",
  "meals.same_day.reheat_only": "À réchauffer",
  "meals.same_day.assemble": "À assembler",
  "meals.same_day.cook_fresh": "Cuisine minute",
  "meals.same_day.minutes": "{n} min",
  // ── LE CHIFFRE, ET CE QU’IL DIT DE LUI-MÊME ─────────────────────────────
  // Aucune de ces phrases n’est une cible, un budget ni un score: elles
  // décrivent de la NOURRITURE, jamais la personne qui la mange. « kcal » reste
  // en minuscules et collé au nombre — c’est une unité, pas un titre de
  // colonne, et elle s’écrit pareil dans les deux langues.
  "meals.energy.dish": "{n} kcal",
  "meals.energy.day": "{n} kcal sur la journée",
  "meals.energy.day_partial": "{n} kcal — {counted} plats comptés sur {total}",
  "meals.energy.day_unreadable": "Pas assez de détail pour additionner cette journée",
  "meals.energy.day_with_addon": "{n} kcal — dont {addon} ajoutées à ton assiette",
  "meals.energy.dish_unknown_ingredient": "Un ingrédient ne figure pas dans notre table de composition",
  "meals.energy.dish_missing_quantity": "Une quantité n’est pas assez précise pour être additionnée",
  "meals.energy.basis":
    "Calculé à partir des quantités de ton plan et d’une table de composition des aliments — pas deviné sur une photo.",
  "meals.energy.household_abstention":
    "La part de chacun est différente dans un plan de foyer : un seul chiffre par plat serait faux pour tout le monde.",
  "meals.energy.switch_on": "Afficher les calories",
  "meals.energy.switch_off": "Masquer les calories",
  "meals.energy.switch_hint": "Tu peux couper ça quand tu veux, et ça se tait partout.",
  "meals.energy.switch_failed": "Ça n’a pas été enregistré. Rien n’a changé.",
  // ⚠️ UNE FOURCHETTE, ET AUCUN RESTE. « il te reste 680 kcal » n’existe dans
  // aucune langue de ce produit. « pour ton poids » n’est pas un ornement:
  // c’est la seule chose sur laquelle la fourchette est posée, et rien ne
  // collecte l’activité.
  "meals.energy.target_range": "Autour de {low}–{high} par jour pour ton poids",
  // ── ⟳ LOT 4 (2026-09-01) · LA FOURCHETTE QUI A SUIVI LA DIRECTION ───────
  //
  // ⚠️ DEUX PHRASES ET PAS UNE INTERPOLATION — le mot ne se place pas au même
  // endroit dans les deux langues, et une garde testée dans une seule langue
  // est une cicatrice déjà payée par ce dépôt.
  //
  // ⚠️ « à ton rythme » N’EST PAS UN ORNEMENT. Le décalage vaut le rythme
  // réglé, pas une perte en général: deux personnes du même poids aux rythmes
  // différents lisent deux fourchettes différentes.
  "meals.energy.target_range_down":
    "Autour de {low}–{high} par jour pour perdre à ton rythme",
  "meals.energy.target_range_up":
    "Autour de {low}–{high} par jour pour prendre à ton rythme",
  "meals.energy.target_measured": "d’après ta pesée du {date}",
  // ⛔ « ton plan n’est pas construit pour l’atteindre » A ÉTÉ RETIRÉ, ET C’EST
  // UNE CORRECTION DE FAIT. La phrase est fausse depuis le 2026-08-18: la cible
  // contraint les GRAMMAGES (lot L8), donc le plan EST dimensionné dessus.
  "meals.energy.target_note":
    "À peu près ce qu’un corps de ta taille dépense en une journée. Ce n’est pas un objectif — le total du jour se pose à côté pour que tu voies où tu en es, pas pour que tu l’atteignes.",
  // ⟳ LOT 4 — LA MÊME NOTE QUAND LA FOURCHETTE A SUIVI LA DIRECTION: d’où vient
  // le décalage, et que les portions sont déjà posées dessus — donc qu’il n’y a
  // rien à compter soi-même.
  "meals.energy.target_note_directed":
    "Ta fourchette au poids, décalée du rythme que tu as réglé. Tes portions sont déjà calibrées dessus — tu n’as rien à compter.",
  "meals.energy.target_no_weight":
    "Ajoute une pesée et ceci devient une fourchette à ta taille.",
  "meals.energy.target_implausible_weight":
    "La dernière pesée ne semble pas juste, donc ceci reste vide.",
  "meals.energy.target_switch_on": "Afficher une fourchette quotidienne",
  "meals.energy.target_switch_off": "Masquer la fourchette quotidienne",
  // ⚠️ LE JOUR EST CAPITALISÉ, Y COMPRIS EN MILIEU DE PHRASE, ET C’EST UN
  // ARBITRAGE. La règle française met « lundi » en minuscule dans « cuisiné
  // lundi »; mais `meals.day.*` est AUSSI le titre d’une colonne de grille et
  // le texte d’une pastille, où la majuscule est correcte. Une seconde table de
  // formes minuscules (sept clés de plus, six sites d’appel à changer) coûterait
  // plus cher que le défaut qu’elle corrige, et elle pourrait diverger de la
  // première. Les six phrases qui interpolent `{day}` — `meals.kitchen.cook_on`,
  // `meals.today.shop_on`, `meals.today.shop_overdue`, `meals.result.from_prep`,
  // `meals.result.from_batch` et les deux `covers` — rendent donc « Lundi ».
  //
  // Les sept jours. ⚠️ LES TROIS PREMIÈRES LETTRES SERVENT D’EN-TÊTE DE COLONNE
  // (`PlanGrid`, `MealPickerGrid` font `.slice(0, 3)`): « Lun », « Mar »,
  // « Mer », « Jeu », « Ven », « Sam », « Dim » sont les abréviations
  // françaises d’usage, et elles restent distinctes deux à deux.
  "meals.day.mon": "Lundi",
  "meals.day.tue": "Mardi",
  "meals.day.wed": "Mercredi",
  "meals.day.thu": "Jeudi",
  "meals.day.fri": "Vendredi",
  "meals.day.sat": "Samedi",
  "meals.day.sun": "Dimanche",
  "meals.slot.breakfast": "Petit-déjeuner",
  "meals.slot.snack_am": "Milieu de matinée",
  "meals.slot.lunch": "Déjeuner",
  "meals.slot.snack_pm": "Après-midi",
  "meals.slot.dinner": "Dîner",
  "meals.slot.before_bed": "Avant le coucher",
  "meals.slot.snack": "Collation",
  "meals.slot.any_meal": "N’importe quel repas",
  // La case, à la première personne et au passé: c’est l’élève qui rapporte un
  // fait, pas le produit qui lui demande de valider une consigne. « Fait »
  // aurait fait du dîner une tâche.
  "meals.tick.label": "J’ai mangé ça",
  "meals.tick.failed": "Ça n’a pas été enregistré. Retouche la case.",
  // FF-057 §3.A — le formulaire accident. Une affirmation et trois tuiles,
  // jamais une question: la décoche est déjà écrite quand il s’affiche, il ne
  // fait que proposer de la préciser. Libellés repris mot pour mot du
  // formulaire de la conversation (`_shared/keel/accident.ts`, COPY.fr).
  "meals.untick.lead": "Ça n’a pas eu lieu comme prévu.",
  "meals.untick.ordered": "J’ai commandé ou mangé dehors",
  "meals.untick.no_time": "Pas eu le temps",
  "meals.untick.ate_other": "J’ai mangé autre chose",
  // La sortie n’écrit rien: la décoche reste. « On en reste là » et pas
  // « Annuler » — il n’y a rien à annuler.
  "meals.untick.dismiss": "On en reste là",
  // Les rayons, dans l’ordre d’un magasin français.
  "meals.aisle.produce": "Fruits & légumes",
  "meals.aisle.protein": "Viande & poisson",
  "meals.aisle.dairy": "Crèmerie",
  "meals.aisle.grains": "Féculents & pain",
  "meals.aisle.frozen": "Surgelés",
  "meals.aisle.pantry": "Épicerie",
  "meals.aisle.other": "Divers",

  // ── /app/meals ───────────────────────────────────────────────────────────
  "meals.title": "Idées de repas",
  "meals.subtitle":
    "Les plats que ton coach met à disposition de tous ceux qu’il accompagne. Des idées, rien de plus — rien n’est suivi ici, et rien ne compte pour ou contre toi.",
  "meals.list.title": "De ton coach",
  "meals.list.empty":
    "Ton coach n’a encore déposé aucune idée de repas. Ta semaine n’est pas affectée — construis-la depuis l’écran du plan.",
  "meals.loading": "Chargement…",
  "meals.error": "Impossible de les charger pour le moment.",

  // ══ /app/health — CE QUE TU NE PEUX PAS MANGER (lot 4) ═══════════════════
  // ⚠️ LES DEUX PHRASES DE COUVERTURE NE DISENT PAS LA MÊME CHOSE, et la
  // nuance EST le contenu. « Reconnu sous ses autres noms » vaut pour un
  // allergène du catalogue; « reconnu seulement tel qu’écrit » vaut pour une
  // saisie libre. Les rapprocher en français ferait croire à quelqu’un qui a
  // tapé « fruits de mer » qu’il est couvert sur « crevette » — et il ne
  // relira jamais.
  "health.title": "Ce que tu ne peux pas manger",
  "health.subtitle":
    "Allergies, intolérances, médicaments. Ton coach construit autour, et la conversation ne te les proposera jamais.",
  "health.list.title": "En vigueur",
  "health.list.empty":
    "Rien de déclaré pour l’instant. Ajoute tout ce qui doit rester hors de ton assiette.",
  "health.list.declared_by_coach": "Ajouté par ton coach",
  "health.list.coverage_full": "Reconnu sous ses autres noms",
  "health.list.coverage_word_only": "Reconnu seulement tel qu’écrit",
  "health.list.coverage_hint":
    "Écrit avec tes mots, donc reconnu sur ce mot-là uniquement. Ton coach le voit et peut ajouter la forme standard.",
  "health.list.retract": "Retirer",
  "health.list.retracting": "Retrait…",
  "health.add.title": "En ajouter un",
  "health.add.kind_label": "De quel type",
  "health.add.what_label": "Quoi exactement",
  "health.add.what_hint": "Prends dans la liste quand c’est possible — la reconnaissance y est plus large.",
  "health.add.other_option": "Autre chose…",
  "health.add.other_label": "Nomme-le",
  "health.add.other_placeholder": "ex. kiwi",
  "health.add.severity_label": "À quel point c’est strict",
  "health.add.severity_medical": "Médical — jamais, en aucune circonstance",
  "health.add.severity_strict": "Strict — je l’évite",
  "health.add.severity_preference": "Préférence — je préfère éviter",
  "health.severity_short.medical": "Médical",
  "health.add.severity_hint":
    "« Médical » n’est pas seulement plus fort : c’est le seul niveau qui fait refuser à la conversation d’en parler du tout.",
  "health.add.notes_label": "Quelque chose à ajouter (facultatif)",
  "health.add.notes_placeholder": "ex. les traces passent, cuit ça va…",
  "health.add.submit": "Ajouter",
  "health.add.saving": "Ajout…",
  "health.add.error_no_ref": "Nomme ce qui doit rester hors de ton assiette.",
  "health.add.error_duplicate": "Celui-là est déjà dans ta liste.",
  "health.kind.allergy": "Allergie",
  "health.kind.intolerance": "Intolérance",
  "health.kind.medical": "Médicament",
  "health.kind.religious": "Religieux ou éthique",
  "health.kind.dislike": "Aversion",
  "health.loading": "Chargement…",
  "health.error": "Impossible de charger ceci. {message}",
  // ══ LE RYTHME DE LA JOURNÉE (lot 4) ══════════════════════════════════════
  // ⚠️ `meals.rhythm.title` EST CITÉ MOT POUR MOT PAR `meals.picker.no_rhythm`.
  // Les deux clés changent ensemble, sinon la grille des repas renvoie l’élève
  // vers une section qui n’existe pas sous ce nom.
  "meals.rhythm.title": "Comment se passe ta journée",
  "meals.rhythm.intro":
    "Coche les moments où tu manges vraiment, un jour ordinaire. Ta semaine se " +
    "construit autour d’eux — aucun repas que tu n’as pas nommé, et aucun des " +
    "tiens laissé de côté.",
  "meals.rhythm.size_hint":
    "La taille est facultative — ne la dis que là où c’est visiblement plus gros " +
    "ou plus léger que le reste de ta journée.",
  "meals.rhythm.size_label": "D’habitude",
  "meals.rhythm.save": "Enregistrer",
  "meals.rhythm.saving": "…",
  "meals.rhythm.saved": "Enregistré. Ton prochain plan se construit là-dessus.",
  // Le repli EST une décision, et il se dit: sans rythme déclaré, la semaine
  // retombe sur trois repas. L’élève doit savoir que c’est une hypothèse, pas
  // son choix.
  "meals.rhythm.none":
    "Rien de coché. Ta semaine retombe sur petit-déjeuner, déjeuner et dîner — " +
    "l’hypothèse ordinaire, pas quelque chose que tu as choisi.",
  "meals.rhythm.needs_goal": "Fixe d’abord ton objectif ci-dessus — ceci s’enregistre avec lui.",
  "meals.rhythm.open": "Modifier",
  "meals.rhythm.close": "Fermer",
  "meals.rhythm.summary_none":
    "Pas réglé — ta semaine retombe sur petit-déjeuner, déjeuner et dîner.",
  "meals.rhythm.unsaved":
    "Modifié mais pas enregistré. Ta semaine tourne encore sur ce qui est affiché au-dessus.",

  // ══ LA LISTE DE COURSES (lot 4) ══════════════════════════════════════════
  "meals.shopping.title": "Liste de courses",
  "meals.shopping.empty": "Rien à acheter — cette semaine tourne avec ce que tu as déjà.",
  "meals.shopping.have": "Je l’ai",
  // Le français met « il reste 1 article » au singulier là où l’anglais ne
  // distingue rien. `plural()` choisit entre les deux.
  "meals.shopping.left_one": "il reste {count} article à acheter",
  "meals.shopping.left_many": "il reste {count} articles à acheter",
  "meals.shopping.all_done": "Tout est coché. Plus rien à acheter.",
  "meals.shopping.ephemeral":
    "Cocher, c’est juste pour le magasin — ce n’est pas enregistré, et rien ici n’est retenu comme le contenu de tes placards.",
  "meals.shopping.pdf": "Enregistrer en PDF",
  "meals.shopping.pdf_building": "Préparation…",
  "meals.shopping.pdf_note":
    "Le PDF emporte la liste entière, y compris ce que tu as coché.",
  "meals.shopping.pdf_failed": "Ça n’a pas marché. Réessaie.",
  "meals.shopping.pdf_ready": "Ta liste est prête.",
  "meals.shopping.pdf_download": "Ouvrir le PDF",
  "meals.shopping.buy_all_on":
    "Tout est à acheter le {date} : rien de ce plan ne se gâte d'ici sa cuisson.",
  "meals.shopping.wave_now": "À acheter maintenant",
  "meals.shopping.wave_later": "À acheter le {date}",
  "meals.shopping.wave_serves": "pour que ce soit frais pour la cuisine du {day}",
  "meals.shopping.wave_intro":
    "Séparé selon ce qui doit être frais : la viande du milieu de semaine ne tient pas depuis lundi.",

  // ══ /app/today — LA JOURNÉE (lot 4) ══════════════════════════════════════
  // ⚠️ AUCUNE PHRASE ICI NE DOIT FAIRE ATTENDRE L'ÉLÈVE. Le coach écrit une
  // MÉTHODE, pas la semaine de chacun: « ton coach prépare ton plan » serait
  // faux, et un écran vide qui dit « attends » à quelqu'un dont c'est le tour
  // est pire qu'un écran vide. La sortie est `/app/plan`, où il compose.
  // Voir docs/keel/MODEL.md.
  "today.title": "Aujourd’hui",
  "today.greeting": "Salut {name}",
  "today.empty": "Rien de prévu aujourd’hui. Profite de ta journée de repos.",
  // Le bouton et la pastille se répondent, à la PREMIÈRE PERSONNE et au passé:
  // c’est l’élève qui rapporte un fait, pas le produit qui lui fait valider une
  // consigne. Même registre que « J’ai mangé ça » sur la case des repas.
  "today.log_button": "C’est fait",
  "today.logged_badge": "Fait",
  "today.flex_button": "Déclarer un écart",
  // Tourné pour que le nombre arrive en dernier: « 1 jours d’écart restants »
  // aurait demandé une paire singulier/pluriel pour un compteur qu’on lit d’un
  // coup d’œil.
  "today.flex_remaining": "Jours d’écart restants cette semaine : {count}",
  // Un trou et rien d’autre — inscrit dans la liste d’exceptions de
  // `parity.int.test.ts` pour cette raison.
  "today.slot_header": "{slot}",
  "today.subtitle": "Ce que tu manges, puis ce que tu fais.",
  "today.loading": "Chargement de ta journée…",
  "today.error": "Impossible de charger ta journée. Recharge la page pour réessayer.",
  "today.no_plan_title": "Tu n’as pas encore de plan pour cette semaine",
  "today.no_plan_body":
    "Ton coach enseigne la méthode — la semaine, c’est toi qui la construis. Dis ce que tu cherches, et ton alimentation de la semaine s’écrit à partir de sa méthode.",
  "today.no_plan_cta": "Construire mon plan de la semaine",
  "today.no_plan_preview_label": "À quoi ressemble une journée posée",
  "today.no_plan_preview_hint":
    "Ce que tu manges, puis ce que tu fais — c’est la forme que prend une journée une fois qu’un plan existe.",
  "today.no_plan_footer":
    "Rien n’est généré pour toi en attendant — le vide est plus honnête qu’un plan que personne n’a écrit.",
  "today.own_week_badge": "Ta semaine",
  "today.own_week_hint":
    "Ces lignes, c’est toi qui les as posées. Rien ici n’est noté — c’est un rappel, pas un examen.",
  "today.own_week_empty":
    "Rien de posé pour aujourd’hui. Les lignes ci-dessous tiennent sur toute la semaine.",
  "today.own_week_nothing":
    "Rien de posé pour aujourd’hui. Profites-en — une journée vide, tu avais le droit de la choisir.",
  "today.own_week_anyday": "Cette semaine, sans jour fixe",
  "today.own_week_from_coach": "De la méthode de ton coach",
  "today.own_week_from_sophia": "Proposé par Sophia",
  "today.own_week_open_plan": "Ouvrir mon plan de la semaine",
  // Deux sections nommées différemment parce que ce sont deux objets: un plat
  // se cuisine, une ligne de méthode se tient.
  "today.own_meals_label": "Ce que tu manges aujourd’hui",
  "today.own_meals_empty":
    "Rien de placé sur aujourd’hui. Ce qui suit tient n’importe quel jour de la semaine.",
  "today.own_meals_other_days":
    "Rien de placé sur aujourd’hui — ce que tu as construit tombe les autres jours de la semaine.",
  "today.own_meals_anyday": "Construit pour aucun jour en particulier",
  "today.own_lines_label": "Ce que tu t’es fixé",
  "today.week_section": "Cette semaine, sans jour fixe",
  "today.week_section_hint":
    "Ces lignes se tiennent n’importe quel jour avant la fin de la semaine.",
  "today.free_section": "Sans horaire",
  "today.family_tally_label": "Aujourd’hui, domaine par domaine",
  "today.family_tally_kept": "{kept}/{total} tenues",
  "today.family_tally_lines": "{count} aujourd’hui",
  "today.derived_note":
    "Ce que tu notes est enregistré tout de suite. La façon dont la journée est évaluée se calcule après, à partir de ces enregistrements — jamais d’un simple appui.",
  "today.log_pending": "Enregistrement…",
  "today.logged_count": "Fait {count}× aujourd’hui",
  "today.instruction_label": "De ton coach",
  "today.evidence_photo": "Ton coach a demandé une photo sur celle-ci.",
  "today.auto_source": "Lu depuis ton {source}. Un silence ne compte jamais comme un manqué.",
  "today.outcome_only": "Suivi, pas noté.",
  "today.deviation_banner":
    "Écart déclaré pour aujourd’hui : {kind}. Cette journée sort du décompte.",
  "today.deviation_banner_slot": "Écart déclaré pour {slot} : {kind}.",
  "today.covered_by_deviation": "Couvert par l’écart que tu as déclaré.",
  "today.log_error": "Ça n’a pas été enregistré. Rien n’a été noté — réessaie.",
  "today.coverage_label": "Jours notés cette semaine",
  "today.coverage_value": "{logged} sur {total}",
  "today.insufficient_data": "Données insuffisantes",
  "today.insufficient_data_hint":
    "L’adhérence reste masquée tant que {min} jours de la semaine ne sont pas notés. C’est la règle, pas une punition.",

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


  // ── /coach/import et /coach/templates — l'import et la relecture ──────────
  // ── Import d'un plan (`/coach/import`) ───────────────────────────────────
  "import.title": "Importer un plan",
  "import.subtitle":
    "Colle un plan, ou dépose le document. Chaque ligne extraite reste rattachée à sa source — tu relis, rien ne se publie tout seul.",
  "import.document": "Ton document",
  "import.extraction": "Engagements extraits",
  "import.paste_placeholder":
    "Colle ton plan ici — exactement comme tu l’as écrit pour ton client.",
  "import.upload_label": "Déposer un PDF ou une photo",
  "import.run": "Décomposer le plan",
  "import.running": "Lecture en cours…",
  "import.loading_hint": "Lecture de ton document. Un PDF prend jusqu’à une minute.",
  "import.empty_state": "Le plan décomposé s’affichera ici, ligne par ligne.",
  "import.confidence": "Confiance de l’extraction",
  // « à tenir » et pas « engagements » : le compte sous cette étiquette compte ce
  // que l'élève doit TENIR. Les observations sont à côté, jamais dedans — et le
  // mot est déjà celui de `part.hint.observations` (« jamais une consigne à
  // tenir, donc jamais comptée comme telle »).
  "import.stat_commitments": "à tenir",
  "import.stat_observed": "+ {count} en observation",
  "import.stat_review": "à vérifier",
  "import.stat_gaps": "trous détectés",
  "import.gaps_title": "À compléter — le document ne dit rien sur :",
  "import.unparsed_title": "Gardé tel quel, non encodé",
  "import.dropzone": "Dépose un PDF ici, ou clique pour parcourir",
  "import.parsing": "Lecture du document…",
  "import.parse_failed": "Ce document n’a pas pu être lu. Essaie un autre fichier.",
  "import.page_count": "{count} pages détectées",
  "import.start_review": "Relire le plan extrait",

  // ── Écran de relecture (les engagements extraits, avant publication) ──────
  "review.title": "Relecture du plan extrait",
  "review.subtitle": "Confirme chaque engagement avant de publier pour {name}",
  "review.commitment_count": "{count} engagements trouvés",
  "review.source_quote": "Dans le document : « {quote} »",
  "review.edit_button": "Modifier",
  "review.remove_button": "Retirer",
  "review.publish_button": "Publier le plan",
  "review.publish_confirm":
    "Publier ce plan pour {name} ? Le plan en cours sera remplacé.",

  // ── Les files de la relecture (W6.3) ─────────────────────────────────────
  "review.queue_verify": "À vérifier",
  "review.queue_verify_hint":
    "Les lignes dont l’extraction n’est pas sûre. Ton temps va ici, pas à relire le plan.",
  "review.queue_complete": "À compléter",
  "review.queue_complete_hint":
    "Les trous du document. Chacun est une proposition que tu acceptes, modifies ou supprimes — rien n’entre dans le plan tout seul.",
  "review.queue_ready": "Prêt",
  "review.queue_ready_hint":
    "Extrait proprement, et découpé comme tu l’as écrit. Ouvre une ligne pour y changer quoi que ce soit.",
  "review.queue_empty": "Rien dans cette file.",
  "review.accept": "Accepter",
  "review.delete": "Supprimer",
  "review.edit": "Modifier",
  "review.done_editing": "Fermer",
  "review.add_line": "Ajouter une ligne",
  "review.mark_verified": "Marquer vérifiée",
  "review.issue_count": "{count} bloquants",
  "review.issues_title": "Cette ligne serait refusée par la base :",
  // Le badge porte sur une LIGNE, donc féminin. « Proposée » et pas
  // « Générée » : la ligne est une proposition tant que le coach ne l'a pas
  // acceptée, et rien n'entre au plan sans son clic.
  "review.auto_generated": "Proposée",

  // Un trou n'est pas un constat sur le document, c'est une décision. Le titre
  // porte la question ; la phrase complète de l'extracteur reste dessous comme
  // sa pièce justificative. « suivi » et pas « noté » : c'est le mot déjà tenu
  // par `part.student.hint.observations` (« Suivi, pas noté »).
  "review.gap_question": "{subject} — tu veux que ce soit suivi ?",
  "review.gap_question_generic": "Tu veux que ce soit suivi ?",
  "review.gap_source": "Ce que dit le document",
  "review.gap_add": "Ajouter",
  "review.gap_ignore": "Ignorer",
  "review.untitled_line": "Nouvelle ligne",
  "review.extraction_notes": "Notes d’extraction",
  "review.save_template": "Enregistrer comme modèle",
  "review.saving": "Enregistrement…",
  "review.saved": "Enregistré dans ta bibliothèque sous « {title} ».",
  "review.save_error": "Rien n’a été enregistré. {message}",
  "review.blocked_by_issues":
    "{count} lignes portent encore un problème bloquant. Corrige-les ou supprime-les avant d’enregistrer.",
  "review.publish": "Approuver et publier à l’élève",
  "review.approve_section": "J’approuve cette section",
  "review.approved_section": "Approuvée à {time}",
  // Trace RÉGLEMENTAIRE : le coach doit comprendre ce qu'il signe. Ce qu'il n'a
  // pas à lire, c'est laquelle de nos fonctions l'écrit dans quelle table.
  "review.approval_hint":
    "Chaque section porte sa propre approbation, horodatée à l’instant où tu cliques. Ce clic est la pièce qui atteste que ces lignes ont été prescrites par toi, et non par le logiciel.",
  "review.approvals_missing":
    "{count} sections attendent encore ton approbation avant que ce plan puisse parvenir à un élève.",
  "review.template_title_label": "Nom du modèle",
  "review.publish_done":
    "Publié. {count} lignes sont désormais sur le plan de ton élève, à partir de sa prochaine journée.",
  "review.publish_failed": "Rien n’a été publié. {message}",


  // ── L'éditeur d'engagement et la bibliothèque de modèles ─────────────────
  // Éditeur d’engagement — un contrôle par axe de plan_commitments
  "editor.axis_identity": "Ce que c’est",
  "editor.axis_anchor": "Quand",
  "editor.axis_level": "Combien",
  "editor.axis_evidence": "Comment c’est prouvé",
  "editor.axis_cadence": "À quelle fréquence",
  "editor.axis_governance": "Quelle rigueur",
  "editor.title": "Titre",
  "editor.template_key": "Clé de modèle",
  "editor.student_instruction": "Consigne à l’élève (reprise mot pour mot)",
  "editor.content_locale": "Langue de ce texte",
  "editor.polarity": "Polarité",
  "editor.activity_class": "Classe",
  "editor.anchor_kind": "Ancrage",
  "editor.slot_key": "Créneau",
  "editor.clock_local": "Heure",
  "editor.tolerance_minutes": "Tolérance (min)",
  "editor.window_start_local": "Début de fenêtre",
  "editor.window_end_local": "Fin de fenêtre",
  "editor.measure": "Mesure",
  "editor.unit": "Unité",
  "editor.target_op": "Comparateur",
  // « Min » et « Max » s’écrivent pareil dans les deux langues: la forme longue
  // est le seul moyen d’avoir une valeur française, et la colonne du formulaire
  // est assez large pour la porter.
  "editor.target_min": "Minimum",
  "editor.target_max": "Maximum",
  "editor.substance_ref": "Substance",
  "editor.food_group_ref": "Groupe d’aliments",
  "editor.evidence_kind": "Preuve",
  "editor.evidence_required": "Preuve obligatoire",
  "editor.auto_source": "Appareil source",
  "editor.counts_toward_adherence": "Compte dans l’adhérence",
  "editor.counts_hint": "Décoché : suivi comme un résultat mesuré, jamais compté.",
  // « Grain » s’écrit pareil dans les deux langues, mais il a un homonyme
  // encombrant sur un écran de nutrition (le grain de céréale). « Granularité »
  // est le mot du métier, sans ambiguïté, et il évite une exception de plus dans
  // `legitimatelyIdentical`. « Substance » juste au-dessus, elle, y reste: c’est
  // le mot français exact, et le seed porte déjà un namespace `substance.*`.
  "editor.evaluation_grain": "Granularité",
  "editor.slot_kind": "Type de créneau",
  "editor.scheduled_days": "Jours",
  "editor.required_days_per_week": "Jours requis par semaine",
  "editor.required_days_hint": "C’est le dénominateur de l’adhérence.",
  "editor.expected_occasions_per_day": "Occasions par jour",
  "editor.priority": "Priorité",
  "editor.autonomy": "Autonomie",
  "editor.flex_eligible": "Éligible aux jours d’écart",
  // L’option vide d’un <select>: on garde exactement la forme typographique de
  // l’anglais, cadratins et espaces compris.
  "editor.none_option": "— aucun —",
  "editor.vocabulary_error":
    "Les vocabulaires n’ont pas pu être chargés : aucun sélecteur n’est fiable. {message}",

  // Bibliothèque de modèles (plan_templates)
  "templates.title": "Tes modèles de plan",
  // « a clone plus a diff »: « écart » est déjà pris par les jours d’écart et les
  // déviations déclarées, donc « différences » — le fait tient, le mot ne se
  // télescope pas avec un autre écran.
  "templates.subtitle":
    "C’est ici que tu travailles. Un modèle s’importe une fois ; le plan de chaque élève en est un clone, plus ses différences.",
  "templates.new": "Nouveau modèle",
  "templates.empty": "Aucun modèle pour l’instant. Importe un plan, ou pars d’un modèle vide.",
  "templates.select_hint": "Ouvre un modèle à gauche, ou commences-en un nouveau.",
  "templates.loading": "Chargement de ta bibliothèque…",
  "templates.error": "Ta bibliothèque n’a pas pu être chargée. {message}",
  // Le seed anglais rend « 1 lines » sur un modèle d’une ligne. Le français
  // retourne la phrase plutôt que d’accorder un pluriel qu’aucun moteur ne gère
  // ici — même geste que `today.flex_remaining`.
  "templates.commitment_count": "Lignes : {count}",
  "templates.status_draft": "Brouillon",
  "templates.status_active": "Actif",
  "templates.status_archived": "Archivé",
  "templates.updated": "Modifié le {date}",
  "templates.open": "Ouvrir",
  "templates.save": "Enregistrer",
  "templates.saving": "Enregistrement…",
  "templates.delete": "Supprimer",
  "templates.delete_confirm": "Supprimer ce brouillon de modèle ? C’est définitif.",
  "templates.field_title": "Nom",
  "templates.field_description": "Description",
  "templates.field_locale": "Langue de ce modèle",
  "templates.field_status": "Statut",
  "templates.field_flex": "Jours d’écart par semaine",
  "templates.field_target": "Objectif d’adhérence (%)",
  "templates.field_autonomy": "Autonomie par défaut",
  "templates.swap_title": "Règle d’échange par défaut",
  "templates.swap_hint":
    "Coché une seule fois, ici, pour tout le modèle. Une règle, pas un menu : c’est là-dessus que l’évaluateur tranche les échanges.",
  "templates.swap_class_equivalent": "Autoriser tout groupe d’aliments de la même classe",
  "templates.swap_allowed_groups": "Ou limiter les échanges à ces groupes",
  "templates.publish": "Publier pour l’élève",
  "templates.approve_lines": "J’approuve ces lignes pour cet élève",
  "templates.publishing": "Publication…",
  "templates.publish_hint":
    "Publier copie ce modèle dans le plan d’un élève et remplace celui qu’il avait. En un seul geste : il ne détient jamais deux plans à la fois.",
  "templates.student_id_label": "Identifiant de l’élève",
  "templates.timezone_label": "Fuseau de l’élève",
  "templates.timezone_hint":
    "La frontière du jour appartient au plan, pas à ton ordinateur. Par défaut, c’est TON fuseau — change-le si ton élève vit ailleurs.",
  "templates.commitments_section": "Lignes",
  "templates.saved": "Enregistré.",

  // Combien de temps le plan tourne (plan_versions.anchor_week_start +
  // duration_weeks). Dit comme un coach y pense — la prochaine séance — et pas
  // dans les deux colonnes que la base stocke ; la conversion lui est rendue
  // pour qu’il la vérifie avant de publier.
  "templates.next_session_label": "Ce plan tient jusqu’à notre prochaine séance",
  "templates.next_session_hint":
    "La date à laquelle tu revois cet élève. Le plan couvre cette semaine-là en entier, puis cesse d’ouvrir des jours tout seul.",
  "templates.next_session_default":
    "Placé à 4 semaines par défaut. Change-le si la séance tombe plus tôt ou plus tard.",
  "templates.next_session_clear": "Sans date de fin",
  "templates.next_session_open": "Fixer une date",
  "templates.plan_window_readout":
    "La semaine 1 commence le {anchor}. Le plan court {weeks} semaines et s’arrête après la semaine du {session}.",
  "templates.plan_window_open_ended":
    "La semaine 1 commence le {anchor}. Sans date de fin : le plan continue d’ouvrir des jours jusqu’à ce que tu en publies un nouveau.",
  "templates.plan_window_invalid":
    "Cette date précède le début du plan. Ton élève ouvrirait une app vide — choisis une date plus tardive.",


  // ── La semaine partagée (components/WeekView.tsx) ─────────────────────────
  // ── La semaine partagée (components/WeekView.tsx) ────────────────────────
  // UN SEUL JEU DE PHRASES POUR DEUX LECTEURS: `ProgressPage` (l’élève sur sa
  // propre semaine) et `CoachStudentPage` (le coach sur celle d’un élève)
  // montent le MÊME composant, sans `viewer` ni branche `isCoach`. Donc aucune
  // phrase à la deuxième personne, et aucune qui nomme « l’élève »: elle serait
  // fausse pour l’un des deux lecteurs. Tout reste impersonnel, comme le seed.
  "week.nav.previous": "Semaine précédente",
  "week.nav.next": "Semaine suivante",
  "week.nav.current": "Revenir à cette semaine",
  "week.label": "Semaine {week}, {year}",
  "week.range": "Du {from} au {to}",
  "week.loading": "Chargement de la semaine…",
  "week.error":
    "Cette semaine n’a pas pu être chargée. Rien ne s’affiche : mieux vaut ça qu’une donnée fausse.",
  "week.retry": "Réessayer",
  "week.in_progress":
    "Cette semaine est encore en cours. Les jours à venir ne comptent pas comme manqués.",
  "week.empty": "Rien d’enregistré sur cette semaine.",
  "week.summary_title": "Résumé de la semaine",
  "week.coverage_label": "Jours notés",
  // « 4/7 » s’écrirait à l’identique dans les deux langues. « sur » lève cette
  // collision et reprend `today.coverage_value`, déjà livré côté élève.
  "week.coverage_value": "{count} sur {total}",
  "week.coverage_caption":
    "Les relevés d’abord : au début, c’est le seul chiffre qui prédit quoi que ce soit. Un jour compte à partir de {min} faits notés.",
  "week.run_label": "Plus longue série",
  "week.facts_label": "Faits notés",
  "week.deviations_label": "Écarts déclarés",
  "week.days_title": "Jour par jour",
  // Le nombre passe en DERNIER, ici et sur `highlight_counts`: une seule forme
  // doit servir 0, 1 et 12, et « 1 faits notés » n’existe pas en français.
  "week.day_facts": "faits notés : {count}",
  "week.day_declared": "déclaré",
  "week.highlights_title": "Ce qui a tenu, ce qui a lâché",
  "week.highlight_held": "Le mieux tenu",
  "week.highlight_dropped": "Le plus lâché",
  // « tenus » et pas « faits »: le compte est `met + flexUsed`, pas le statut
  // `met` seul, et le mot répond au titre de la section.
  "week.highlight_counts": "tenus : {met} · en partie : {partial} · manqués : {missed}",
  "week.highlight_none":
    "Aucune ligne n’a assez de jours évalués cette semaine pour être nommée.",
  "week.highlight_locked":
    "Une ligne n’est nommée qu’à partir de {min} jours notés. Cette semaine en compte {logged}.",
  "week.adherence_label": "Adhérence",
  // Règle de produit assumée, pas une panne. On reprend mot pour mot
  // `today.insufficient_data`, qui dit déjà exactement ça sur l’écran du jour.
  "week.adherence_locked": "Données insuffisantes",
  "week.adherence_gate":
    "Un pourcentage demande {min} jours notés ; cette semaine en compte {logged}. En afficher un maintenant mesurerait la saisie, pas la semaine.",
  "week.adherence_no_review":
    "Les relevés suffisent. Le chiffre apparaît une fois le bilan de la semaine établi — rien ne se calcule ici à la volée.",
  "week.lines_title": "Ligne par ligne",
  "week.lines_col_line": "Engagement",
  "week.lines_empty": "Aucune ligne active dans le plan publié.",
  "week.line_weekly": "Ligne hebdomadaire",
  "week.line_off": "Pas au plan ce jour-là",
  "week.line_future": "À venir",
  "week.line_no_row": "Pas encore évalué",
  "week.deviations_title": "Déclarés à l’avance",
  "week.deviations_caption":
    "Déclaré avant le jour, pas avoué après. Hors du dénominateur, pas hors de la semaine.",
  "week.deviations_empty": "Rien de déclaré cette semaine.",
  "week.deviation_entry": "{kind} le {date}",
  // La légende du même écran nomme déjà ce statut « Souplesse utilisée »
  // (`status.flex_used`). Deux mots pour un seul mécanisme sur une même page se
  // lisent comme deux mécanismes: le « jour d’écart » du glossaire cède ici.
  "week.deviation_flex": "souplesse utilisée",
  "week.facts_title": "Ce qui a été noté",
  "week.facts_empty": "Aucun fait enregistré cette semaine.",
  "week.facts_logged": "noté",
  "week.facts_photo": "photo jointe",

  // ⚠️ RAPATRIÉES DE `progress.*`, ET C'EST CE DÉPLACEMENT QUI A RENDU
  // `/coach/clients/:id` TRADUISIBLE — voir la note de ces quatre clés dans
  // `en.ts`. Elles étaient empruntées au namespace d'un écran que plus aucun
  // fichier du dépôt n'importe.
  "week.adherence_overall": "Ensemble",
  "week.adherence_core": "Engagements principaux",
  "week.days_value": "{count} jours",
  "week.day_value": "{count} jour",
  // ── Le titre par défaut d’un plan importé ─────────────────────────────────
  // Il part en base et l’élève le relit sur son plan: un plan composé dans une
  // interface française ne doit pas s’appeler « Imported plan » chez lui.
  "review.default_template_title": "Plan importé",
  // Le nom de la touche, tel qu’il est gravé sur un clavier français.
  "review.key_delete": "suppr",
  "review.quote_verbatim": "« {quote} »",

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
  // Les six libellés partagés par `/coach/doctrine` et `/coach/protocol`.
  // `household.goal.*` reste à part: elle s'adresse à l'ÉLÈVE, autre registre.
  // « Perte de masse grasse » et pas « perte de gras »: c'est le terme du
  // métier, et c'est déjà celui de `household.goal.fat_loss`. Le registre du
  // coach se porte par le lexique — deux mots pour le même objectif à deux
  // endroits du produit, c'est exactement le doublon que cette table supprime.
  "coach.goal.fat_loss": "Perte de masse grasse",
  "coach.goal.muscle_gain": "Prise de muscle",
  // On ne dit pas « recomposition »: le mot est du jargon et ne dit pas ce que
  // l'objectif fait. Le libellé porte la signature — le poids tient, la
  // silhouette change.
  "coach.goal.recomposition": "Même poids, autre silhouette",
  // « Performance » seul s'écrit à l'identique en français. « sportive » lève
  // l'ambiguïté et suit le pack déjà livré (`household.goal.performance`).
  "coach.goal.performance": "Performance sportive",
  "coach.goal.health": "Santé",
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

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/progress` — L'AVANCÉE DE L'ÉLÈVE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Le tutoiement, comme partout dans l'app de l'élève: Sophia s'adresse à la
  // personne qu'elle suit tous les jours, pas à un prospect.
  "student_progress.title": "Mes progrès",
  "student_progress.loading": "Chargement…",
  "student_progress.error": "Impossible de charger tes données.",
  "student_progress.restricted":
    "On met les chiffres de côté pour l’instant. Ce qui compte cette semaine, c’est comment tu te sens — et ton coach le sait.",
  "student_progress.range_week": "7 jours",
  "student_progress.range_month": "30 jours",

  "student_progress.consistency.label": "Ta régularité",
  "student_progress.consistency.out_of": "/ {total} jours",
  "student_progress.consistency.hint":
    "C’est ce qui compte le plus, et de loin. Pas la perfection des journées — le simple fait de les avoir notées.",

  "student_progress.pulse.label": "Comment ça s’est passé",
  "student_progress.pulse.empty": "Aucun point du soir sur cette période pour l’instant.",
  "student_progress.pulse.good": "{count} tout va bien",
  "student_progress.pulse.mixed": "{count} moyen",
  "student_progress.pulse.hard": "{count} difficile",
  "student_progress.pulse.dominant_label": "Quand c’est dur, c’est le plus souvent",
  // Les trois axes du tap du soir, sous leur forme DANS une phrase: « c’est le
  // plus souvent la faim ». L'article est dans la valeur, parce que le genre
  // change d'un axe à l'autre.
  "student_progress.axis.energy": "l’énergie",
  "student_progress.axis.hunger": "la faim",
  "student_progress.axis.sleep": "le sommeil",

  "student_progress.food.label_week": "Ta semaine dans l’assiette",
  "student_progress.food.label_month": "Ton mois dans l’assiette",
  "student_progress.food.empty":
    "Aucune photo lue sur cette période pour l’instant. Envoie une assiette dans la conversation, et ça commence à s’accumuler ici.",
  // L'accord du participe suit le compte: « 1 repas noté », « 5 repas notés ».
  "student_progress.food.meals_one": "{count} repas noté",
  "student_progress.food.meals_many": "{count} repas notés",
  "student_progress.food.across": "sur",
  "student_progress.food.days_one": "{count} jour",
  "student_progress.food.days_many": "{count} jours",
  "student_progress.food.groups":
    "Des légumes à {veg} repas sur {meals} · des protéines à {protein} · des fruits à {fruit}.",
  "student_progress.food.three_counts":
    "Cochés comme prévu : {ticked} · mangés hors plan : {offPlan} · photographiés : {photographed}.",
  "student_progress.food.seen_most": "Le plus vu : {list}",
  "student_progress.food.also": "Aussi sur cette période : {list}",
  "student_progress.food.dinners_large": "Des dîners copieux {large} soirs sur {total}.",
  "student_progress.food.missing_days": "Rien de noté {days}.",
  "student_progress.food.veg_up": "Plus de légumes que la semaine d’avant.",
  "student_progress.food.veg_down": "Moins de légumes que la semaine d’avant.",
  "student_progress.food.veg_same": "À peu près autant de légumes que la semaine d’avant.",
  "student_progress.food.footnote":
    "Ces comptes viennent de tes photos — ce qui est apparu, et à quelle fréquence. Aucune calorie ici : c’est le fait de noter qui change les choses.",

  "student_progress.ate.label": "Ce que tu as mangé",
  "student_progress.ate.empty":
    "Rien de noté sur cette période pour l’instant. Envoie une assiette dans la conversation, ou dis-moi simplement ce que tu as pris — les deux arrivent ici.",
  "student_progress.ate.unreadable": "noté, rien de lisible sur la photo",
  "student_progress.ate.footnote":
    "Voilà ce qui a été lu de tes photos et de ce que tu m’as dit. Si quelque chose est faux, dis-le dans la conversation et c’est corrigé sur-le-champ.",
  "student_progress.band.small": "petite portion",
  "student_progress.band.moderate": "portion normale",
  "student_progress.band.large": "grosse portion",

  "student_progress.rhythm.label": "Ton rythme",
  "student_progress.rhythm.empty":
    "Rien de noté sur cette période pour l’instant. Dis-moi ce que tu as mangé dans la conversation, ou envoie une assiette — les deux atterrissent ici.",
  "student_progress.rhythm.cell_empty": "rien de noté",
  "student_progress.rhythm.cell_count": "{count} noté",
  "student_progress.rhythm.busiest_label": "L’essentiel de ce que tu notes tombe",
  "student_progress.rhythm.unplaced_one":
    "{count} fait sans heure — pas placé dans la grille.",
  "student_progress.rhythm.unplaced_many":
    "{count} faits sans heure — pas placés dans la grille.",
  "student_progress.rhythm.footnote":
    "La taille du bloc dit à quel point l’assiette avait l’air remplie — petite, normale ou grosse. C’est toute l’échelle, et c’est volontaire : un chiffre ici serait faux dans une direction qu’on sait prévoir.",

  "student_progress.plates.label": "Tes assiettes",
  "student_progress.plates.empty": "Aucune photo lue sur cette période.",
  "student_progress.plates.line_one":
    "{count} assiette : {small} petite, {moderate} normale, {large} grosse",
  "student_progress.plates.line_many":
    "{count} assiettes : {small} petites, {moderate} normales, {large} grosses",
  "student_progress.plates.unclear_suffix": ", {count} indéterminées",

  "student_progress.weight.label": "Ton poids",
  "student_progress.weight.empty":
    "Aucun poids sur cette période pour l’instant. Tu le saisis au point du dimanche.",
  "student_progress.weight.delta": "{delta} kg sur la période",
  "student_progress.weight.footnote":
    "Une pesée par semaine, lue comme une ligne et non comme un chiffre : d’un jour à l’autre, l’eau fait bouger la balance plus qu’une semaine entière d’alimentation.",

  // ── 5. LES SÉANCES — UN COMPTE, ET RIEN QUI EN DÉRIVE (L2b, 2026-08-18) ──
  // ⛔ Aucune calorie ici, dans aucune des deux langues. Voir le bloc jumeau
  // d'`en.ts` pour les nombres qui portent la décision.
  "student_progress.activity.label": "Tes séances",
  "student_progress.activity.empty":
    "Rien de noté sur cette période. Si tu as bougé, ajoute-le ci-dessous — ça reste un compte, et rien de ton plan ne change à cause de ça.",
  "student_progress.activity.sessions_one": "{count} séance notée",
  "student_progress.activity.sessions_many": "{count} séances notées",
  "student_progress.activity.across": "sur",
  "student_progress.activity.days_one": "{count} jour",
  "student_progress.activity.days_many": "{count} jours",
  "student_progress.activity.minutes": "{minutes} min au total, déclarées sur {from} d’entre elles.",
  "student_progress.activity.by_intensity": "Intensité : {list}",
  "student_progress.activity.intensity.easy": "facile",
  "student_progress.activity.intensity.moderate": "modérée",
  "student_progress.activity.intensity.hard": "dure",
  "student_progress.activity.intensity.undeclared": "non dite",
  "student_progress.activity.kind.daily_movement": "Mouvement du quotidien",
  "student_progress.activity.kind.strength": "Renforcement",
  // ⚠️ IDENTIQUE À L'ANGLAIS, ET C'EST LA RÉPONSE JUSTE. « Cardio » s'écrit
  // pareil dans les deux langues; le « traduire » demanderait d'inventer une
  // différence. L'exception est déclarée dans `parity.int.test.ts`, visible en
  // diff, comme les trois pays et les deux noms de langue.
  "student_progress.activity.kind.cardio": "Cardio",
  "student_progress.activity.kind.recovery": "Récupération",
  "student_progress.activity.kind.mobility": "Mobilité",
  "student_progress.activity.duration": "{count} min",
  "student_progress.activity.remove": "Retirer",
  "student_progress.activity.removing": "Retrait…",
  "student_progress.activity.footnote":
    "Un compte, et rien qui en dérive. Aucune calorie : une séance que tu déclares est fausse de 30 à 50 %, donc la retirer de la journée rendrait la journée moins sûre, pas plus.",

  // ── LA SAISIE ────────────────────────────────────────────────────────────
  "student_progress.activity.form.label": "Noter une séance",
  "student_progress.activity.form.date": "Jour",
  "student_progress.activity.form.kind": "C’était quoi ?",
  "student_progress.activity.form.kind_placeholder": "Choisis…",
  "student_progress.activity.form.duration": "Combien de temps ? Facultatif.",
  "student_progress.activity.form.duration_placeholder": "minutes",
  "student_progress.activity.form.intensity": "À quelle intensité ? Facultatif.",
  "student_progress.activity.form.intensity_none": "Je ne dis pas",
  "student_progress.activity.form.submit": "Noter",
  "student_progress.activity.form.saving": "Enregistrement…",
  "student_progress.activity.form.error": "Rien n’a été enregistré. {message}",
  "student_progress.activity.form.duration_range":
    "Les minutes doivent être un nombre entier entre {min} et {max}.",

  // ── LES CINQ MOMENTS DE LA JOURNÉE ──────────────────────────────────────
  "moment.morning": "Matin",
  "moment.midday": "Midi",
  "moment.afternoon": "Après-midi",
  "moment.evening": "Soir",
  "moment.night": "Nuit",
  // La forme DANS une phrase porte son article: « tombe le matin »,
  // « tombe l’après-midi ». C'est ce qu'un `.toLowerCase()` ne sait pas faire.
  "moment.in.morning": "le matin",
  "moment.in.midday": "le midi",
  "moment.in.afternoon": "l’après-midi",
  "moment.in.evening": "le soir",
  "moment.in.night": "la nuit",

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/plan` — LE CONSTRUCTEUR DE REPAS
  // ══════════════════════════════════════════════════════════════════════════
  "meals.form.title": "Compose-moi quelque chose",
  "meals.form.mode_label": "On part d’où",
  "meals.form.mode_from_pantry": "De ce que j’ai déjà",
  "meals.form.mode_to_shop": "J’irai faire les courses",
  "meals.form.window_label": "Quels jours",
  "meals.form.window_from": "Du",
  "meals.form.window_to": "Au",
  "meals.form.window_until_sunday": "Jusqu’à dimanche",
  "meals.form.window_seven_days": "Pour 7 jours",
  "meals.form.window_exact": "Choisir exactement",
  "meals.form.window_days_label": "Combien de jours",
  "meals.form.window_span": "du {from} au {to} · {days}",
  "meals.form.window_days_one": "{n} jour",
  "meals.form.window_days_other": "{n} jours",
  "meals.form.window_one_day": "Aujourd’hui seulement.",
  "meals.form.slot_label": "Un repas en particulier (facultatif)",
  "meals.form.slot_any": "La journée entière",
  "meals.form.servings_label": "Pour combien de personnes",
  "meals.form.pantry_label": "Ce que tu as sous la main",
  "meals.form.pantry_hint":
    "Un par ligne. Ajoute une quantité si elle compte — «riz, 500 g».",
  "meals.form.pantry_placeholder": "hauts de cuisse de poulet\nriz\népinards",
  "meals.form.preferences_label": "Ce dont tu as envie cette fois (facultatif)",
  "meals.form.preferences_placeholder":
    "mezzé d’été — beaucoup de carottes, du cru, rien de lourd",
  "meals.form.preferences_hint":
    "Une humeur, pour ces repas-là. Ce que tu aimes toujours ou ne manges jamais va dans «Ce que tu m’as dit sur ton alimentation» — c’est retenu tout seul.",
  "meals.form.preferences_carried":
    "Repris de ton dernier plan. Change-le si tu as envie d’autre chose.",
  "meals.form.context_label": "Ce qui se passe cette semaine (facultatif)",
  "meals.form.context_placeholder":
    "des invités samedi · le four est en panne · retour de vacances, frigo vide",
  "meals.form.context_carried":
    "Repris de ton dernier plan. Change-le si cette semaine est différente.",
  "meals.form.submit": "Compose",
  "meals.form.building": "Composition…",
  "meals.form.cancel": "Annuler",
  "meals.form.pantry_required":
    "Dis ce que tu as sous la main, ou passe à «J’irai faire les courses».",
  "meals.result.title": "Tes repas",
  "meals.result.empty":
    "Rien de composé pour l’instant. Dis-moi d’où on part, ci-dessus, et je t’assemble quelques repas.",
  "meals.result.shopping_title": "Liste de courses",
  "meals.result.shopping_close": "Masquer la liste de courses",
  "meals.rebuild.button": "Composer un autre plan",
  "meals.rebuild.title": "Composer un autre plan",
  "meals.rebuild.prepare_next": "Préparer le plan suivant",
  "meals.result.tab_current": "Cette semaine",
  "meals.result.tab_next": "Suivant",
  // L'avertissement NOMME les jours qui partent: les courses de ces jours-là
  // ont peut-être déjà été faites, et cette dépense-là ne se rembourse pas.
  "meals.rebuild.truncates":
    "Ça retire {days} jour(s) à ton plan en cours ({from} → {to}). Tu as peut-être déjà fait les courses pour ces jours-là.",
  "meals.rebuild.warning":
    "Ça remplace la semaine ci-dessous. Ce qui s’y trouve cesse d’être ce que tu ouvriras demain.",
  "meals.rebuild.building":
    "Composition de ta nouvelle semaine — ça prend quelques secondes. Celle que tu avais reste en place jusqu’à ce que celle-ci arrive.",

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/plan` — LA CUISINE ET CE QUE L'ÉLÈVE A DIT
  // ══════════════════════════════════════════════════════════════════════════
  "plan.cooking.title": "Comment tu cuisines",
  "plan.cooking.subtitle":
    "Ce que tu peux vraiment faire dans une semaine. Sans ça, le plan est composé pour quelqu’un d’autre.",
  "plan.cooking.summary_open": "Modifier",
  "plan.cooking.summary_edit": "Dis-moi",
  "plan.cooking.summary_close": "Fermer",
  "plan.cooking.time_label": "Temps par session de cuisine",
  "plan.cooking.time_15": "15 minutes — j’entre et je sors",
  "plan.cooking.time_30": "30 minutes",
  "plan.cooking.time_60": "Une heure, ça ne me dérange pas",
  "plan.cooking.difficulty_label": "Recettes",
  "plan.cooking.difficulty_simple": "Simples — peu d’étapes, peu de casseroles",
  "plan.cooking.difficulty_normal": "Normales",
  "plan.cooking.difficulty_keen": "J’aime cuisiner, envoie",
  "plan.cooking.variety_label": "Variété",
  "plan.cooking.variety_repeat": "Ça ne me gêne pas de remanger la même chose",
  "plan.cooking.variety_some": "Un peu de répétition, ça va",
  "plan.cooking.variety_varied": "Varie autant que possible",
  // « Budget » et « Normal » s'écrivent à l'identique en français, comme les
  // deux clés jumelles de `setup.plan.*`. Les deux autres paliers, eux,
  // diffèrent bien — c'est la preuve que la table est traduite, pas recopiée.
  "plan.cooking.budget_label": "Budget de ce plan",
  "plan.cooking.budget_hint":
    "Toutes les courses, dans ta monnaie. Demandé à chaque fois — le chiffre " +
    "de la dernière fois n’est qu’un point de départ.",
  // ── LOT B · COMMENT ON CUISINE CETTE SEMAINE ────────────────────────────
  // Les libellés du chantier, mot pour mot: « un seul plat pour tout le
  // monde » / « une cuisson, des plats un peu différents » / « chacun le
  // sien ». Ils portent la conséquence, jamais le barreau.
  "plan.cooking.shape_label": "Comment tu cuisines cette semaine",
  "plan.cooking.shape_hint":
    "Un plafond, pas un ordre : personne n’a de plat à lui tant que ce qu’il " +
    "mange peut sortir de la casserole commune. Demandé à chaque fois.",
  "plan.cooking.shape_engine": "Laisse le plan décider",
  "plan.cooking.shape_one_dish": "Un seul plat pour tout le monde",
  "plan.cooking.shape_one_session": "Une cuisson, des plats un peu différents",
  "plan.cooking.shape_separate": "Chacun le sien",
  // ── « TOUT DANS UNE SESSION DE CUISINE » (2026-09-01) ─────────────────
  // ⚠️ LE LIBELLÉ DIT LE GESTE, PAS LE RÉGLAGE. « Session unique » est du
  // vocabulaire de moteur; ce qui se passe dans la cuisine, c'est qu'on
  // cuisine une seule fois pour toute la période.
  "plan.cooking.one_session_label":
    "Tout cuisiner en une seule fois",
  // ⚠️ ELLE DIT LES DEUX MOITIÉS DU MARCHÉ. Sans « le surplus part au
  // congélateur », la case ressemble à un raccourci gratuit — et la personne
  // découvre devant son frigo qu'elle a sept jours de plats à congeler.
  "plan.cooking.one_session_hint":
    "Une seule session de cuisine pour toute la période : ce qui ne se mange " +
    "pas dans les jours qui suivent part au congélateur, et se sort la veille.",
  // ⛔ ELLE DIT CE QUI MANQUE ET OÙ, jamais « indisponible ». Un refus qui ne
  // nomme pas sa condition se lit comme un bouton mort — cicatrice mesurée
  // trois fois sur l'écran de réglages.
  // ── « JE CUISINE LA VEILLE » (2026-09-01) ────────────────────────────
  // ⚠️ LE LIBELLÉ DIT LE GESTE, pas le mécanisme. « La fenêtre recule d'un
  // jour » est du vocabulaire de moteur; ce qui se passe dans la cuisine,
  // c'est qu'on cuisine la veille du premier jour.
  "plan.cooking.day_before_label":
    "Je cuisine la veille du premier jour",
  "plan.cooking.day_before_hint":
    "Le plan commencera un jour plus tôt, et ce jour-là ne portera aucun " +
    "repas : c'est celui où tu cuisines pour la suite.",
  // ⛔ DEUX REFUS, DEUX PHRASES — ils se réparent par des gestes OPPOSÉS.
  "plan.cooking.day_before_starts_today":
    "Ce plan commence aujourd'hui : la veille est déjà passée. Décale le " +
    "premier jour pour cuisiner avant.",
  "plan.cooking.day_before_no_room":
    "Ce plan couvre déjà sept jours, le maximum. Raccourcis-le d'un jour " +
    "pour faire de la place à la session de la veille.",
  "plan.cooking.one_session_needs_freezer":
    "Il faut un congélateur pour ça : sans lui, un plat cuisiné ne tient que " +
    "deux jours de plus. Coche-le dans « Avec quoi vous cuisinez » pour ouvrir " +
    "cette option.",
  "plan.cooking.time_minutes": "{n} min",
  "plan.cooking.time_hours": "{n} h",
  "plan.cooking.time_required": "Dis combien de temps peut durer une session.",
  "plan.cooking.budget_required":
    "Dis combien ce plan peut coûter. Sans chiffre, il n’y a rien à arbitrer.",
  "plan.cooking.save": "Enregistrer",
  "plan.cooking.saving": "Enregistrement…",
  "plan.cooking.saved": "Enregistré.",
  "plan.cooking.no_goal":
    "Règle d’abord ton objectif au-dessus — ça s’enregistre avec lui.",
  "plan.cooking.none_picked": "Pas encore réglé",

  "plan.told.title": "Ce que tu m’as dit sur ton alimentation et ta semaine",
  "plan.told.subtitle":
    "Repris de tes conversations — ce que tu aimes, et ce que ta semaine permet vraiment. Garde ce qui est juste, corrige-le, ou jette-le : ce que tu gardes sert quand ta semaine est composée.",
  "plan.told.suggested": "À garder ?",
  "plan.told.keep": "Garder",
  "plan.told.update": "Mettre à jour",
  "plan.told.replaces": "remplace",
  "plan.told.recheck_prefix": "Tu y es revenu le",
  "plan.told.recheck_suffix": "— toujours d’actualité ?",
  "plan.told.drop": "Pas juste",
  "plan.told.yours": "Dans ton plan",
  "plan.told.edit": "Corriger",
  "plan.told.remove": "Retirer",
  "plan.told.save": "Enregistrer",
  "plan.told.cancel": "Annuler",
  "plan.told.empty":
    "Rien pour l’instant. Dis-moi dans la conversation ce que tu aimes, ce que tu ne supportes pas, et quand ta semaine ne te laisse pas le temps de cuisiner — ça arrive ici.",
  "plan.told.no_goal":
    "Règle d’abord ton objectif au-dessus — ça s’enregistre avec lui.",
  "plan.told.saving": "Enregistrement…",
  "plan.told.open": "Modifier",
  "plan.told.close": "Fermer",
  "plan.told.summary_one": "1 chose que tu m’as dite",
  "plan.told.summary_many": "{count} choses que tu m’as dites",
  "plan.told.summary_pending": " · {count} en attente de toi",

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/plan` — L'ÉCRAN LUI-MÊME
  // ══════════════════════════════════════════════════════════════════════════
  "plan.page.title": "Le plan de ma semaine",
  "plan.page.subtitle":
    "Ce que tu manges cette semaine, composé à partir de la méthode de ton coach. Des plats et un rythme — rien ici ne te note.",

  "plan.save": "Enregistrer",
  "plan.cancel": "Annuler",
  "plan.change": "Modifier",
  "plan.add": "Ajouter",
  "plan.busy": "…",

  "plan.about.title": "À propos de toi",
  "plan.about.setup": "Régler",
  "plan.about.done": "Terminé",
  "plan.about.empty":
    "Quatre questions courtes, une seule fenêtre. Ta semaine se compose à partir de tes réponses — rien ici n’est partagé avec ton coach.",
  "plan.about.numbers": "Chiffres",
  "plan.about.goal": "Objectif",
  "plan.about.day": "Ta journée",
  "plan.about.cooking": "Cuisine",
  "plan.about.last_request": "Dernier plan demandé",
  "plan.about.told": "Tu m’as dit",
  "plan.about.not_set": "Pas encore réglé",

  // ══════════════════════════════════════════════════════════════════════════
  // `/app/plan` ACCUEILLE LA DEMANDE DE PLAN — POUR TOUT LE MONDE
  // ══════════════════════════════════════════════════════════════════════════
  "plan.request.title": "Demander un plan",
  "plan.request.presence_title": "Qui est là, jour par jour",
  "plan.request.presence_intro":
    "Une ligne par bouche. Marque les repas que chacun ne prend pas à la maison sur cette fenêtre-ci.",
  "plan.request.presence_open": "Marquer les absences",

  // ── L'ENVIE DE LA SEMAINE ───────────────────────────────────────────────
  // ⚠️ LE TITRE EST LA PHRASE DE L'UTILISATEUR, MOT POUR MOT. Elle n'est pas du
  // français canonique, et ce n'est PAS une coquille à corriger: c'est une
  // instruction produit explicite. La corriger est une décision humaine.
  "plan.envy.title": "C’est la maison a envie de quoi ?",
  "plan.envy.body":
    "Une ligne, pour tout le monde, sur cette semaine-ci. Personne d’autre n’a rien à remplir, et la laisser vide ne pose aucun problème.",
  "plan.envy.placeholder": "Léa veut des pâtes, Marc en a marre du poulet.",

  // ── QUELLE FAÇON DE MANGER LE PLAT COMMUN SUIT ──────────────────────────
  "plan.reference.title": "Quelle façon de manger le plat commun suit",
  // Le titre quand on sait qui s'oppose: il nomme les deux personnes, jamais
  // leur objectif. Voir la note longue côté anglais pour la raison du refus de
  // détailler les deux consignes de service.
  "plan.reference.title_pair":
    "{first} et {second} ne mangent pas de la même façon — le plat commun ne peut suivre qu’une des deux",
  "plan.reference.hint":
    "Quand deux adultes suivent ici des méthodes différentes, le plat commun ne peut en suivre qu’une. Choisis laquelle. Ça change ce qu’on cuisine, jamais la quantité que chacun reçoit — les parts sont calculées personne par personne dans les deux cas.",
  "plan.reference.default": "Celle de la personne qui compose cette semaine-là",
  "plan.reference.saved": "Enregistré.",

  // ── « À TABLE » ─────────────────────────────────────────────────────────
  "plan.table.title": "À table",
  "plan.table.standard": "Une part standard",

  // ── POURQUOI CES JOURS-LÀ ───────────────────────────────────────────────
  "plan.rationale.title": "Pourquoi ces jours-là",

  // ── LE BROUILLON ────────────────────────────────────────────────────────
  "plan.draft.cta": "Prévisualiser",
  "plan.draft.working": "Composition d’un aperçu…",
  // ── LOT D · LE RETOUR DE FIN DE PLAN ────────────────────────────────────
  // Les libellés des QUESTIONS ne sont pas ici: ils vivent dans
  // `_shared/keel/plan_feedback.ts`, dans les deux langues, avec leur lecteur
  // nommé à côté. Ce qui est ici est le chrome de l'écran.
  "plan.feedback.title": "Ce plan est fini",
  "plan.feedback.intro":
    "Deux ou trois choses sur le plan lui-même — ce qu’il t’a demandé, pas ce " +
    "que tu en as fait. Rien n’est obligatoire.",
  "plan.feedback.dishes_title": "Les plats qu’il portait",
  "plan.feedback.dishes_hint":
    "Marque ceux qui valent le coup d’être revus, et ceux à laisser de côté.",
  "plan.feedback.again": "Encore",
  "plan.feedback.not_again": "Sans moi",
  "plan.feedback.envy_title": "Une envie pour la suite",
  "plan.feedback.envy_hint":
    "Une ligne, pour toute la table. Elle part dans le plan de la semaine " +
    "prochaine.",
  "plan.feedback.envy_placeholder": "Léa veut des pâtes, Marc en a marre du poulet",
  "plan.feedback.send": "Envoyer",
  "plan.feedback.sending": "Envoi…",
  "plan.feedback.dismiss": "Pas maintenant",
  "plan.draft.title": "Ce que ça donnerait",
  "plan.draft.note_label": "Ce qui ne va pas",
  "plan.draft.note_hint":
    "Une phrase suffit. Elle sert à refaire l’aperçu, elle n’est pas enregistrée.",
  "plan.draft.note_placeholder": "Trop de poisson, et rien le jeudi soir.",
  "plan.draft.remix": "Refaire avec ça",
  "plan.draft.adopt": "Adopter ce plan",
  "plan.draft.adopting": "Enregistrement…",
  "plan.draft.discard": "Laisser tomber",
  "plan.draft.not_saved": "Rien n’est encore enregistré.",
  "plan.draft.note_too_long": "Trop long. Dis-le en une phrase.",
  "plan.draft.note_rejected":
    "Je ne peux pas repartir de cette phrase-là. Reformule ce que tu veux changer dans le plan.",
  "plan.draft.turns_left": "Encore {count} reprises possibles",
  "plan.draft.turns_one": "Une seule reprise possible — elle compte.",
  "plan.draft.turns_none": "Plus de reprise. C’est l’aperçu que tu as.",
  "plan.draft.chars_left": "Encore {count} signes",
  "plan.draft.note_partial":
    "Une partie de ce que tu as écrit n’a pas été reprise. Le reste, si.",
  "plan.draft.adopt_recomposes":
    "Adopter le compose pour de vrai à partir de la même demande : le résultat peut différer un peu de cet aperçu.",

  // ── LA PART DU RÉCLAMÉ ──────────────────────────────────────────────────
  "plan.mine.title": "Ta part",
  "plan.mine.standard": "Une part standard",
  "plan.mine.approve": "Je valide",
  "plan.mine.approved": "Validé.",
  "plan.mine.request_change": "Demander une modif",
  "plan.mine.change_label": "Ce que tu voudrais changer",
  "plan.mine.change_sent": "C’est parti au foyer.",
  "plan.mine.household_dishes": "Ce que la maison cuisine",

  // ── UN PLAN PAR PERSONNE (2026-08-14) ────────────────────────────────────
  "plan.person.title": "Qui mange quoi",
  "plan.person.hint":
    "Un plat pour la table, une ligne par personne. Ce qui change d’une ligne à l’autre, c’est la part — jamais le plat.",
  "plan.person.mode_together": "Côte à côte",
  "plan.person.mode_one": "Une personne",
  "plan.person.dish_row": "Le plat",
  "plan.person.standard": "Une part standard",
  "plan.person.pick": "Lire la semaine de",

  "plan.section.basics.title": "Informations de base",
  "plan.section.basics.intro":
    "Qui tu es et où tu en es. Ça sert à dimensionner tes portions.",
  "plan.section.goal.title": "Ton objectif",
  "plan.section.goal.intro":
    "Ce que tu cherches. Ça décide quelles parties de la méthode de ton coach sont mises en avant pour toi.",
  // ── ⟳ LOT 5 · LES CHIFFRES (voir en.ts pour les deux arbitrages de ton) ──
  "plan.section.numbers.title": "Ce que ton plan affiche",
  "plan.section.numbers.intro":
    "Si ton plan montre ce qu’il totalise — calculé depuis ses quantités, jamais deviné.",
  "plan.section.day.title": "Comment se passe ta journée",
  "plan.section.day.intro":
    "Coche les moments où tu manges vraiment. Rien que tu n’aies nommé, et aucun des tiens écarté.",
  "plan.section.cooking.title": "Comment tu cuisines",
  "plan.section.cooking.intro":
    "Quels jours tu peux cuisiner, et combien de temps. Tes sessions se construisent là-dessus.",
  "plan.section.told.title": "Ce que tu m’as dit",
  "plan.section.told.intro":
    "Repris de tes conversations. Garde ce qui est juste, corrige-le, ou jette-le.",

  // Les jetons restent anglais (R1) ; seuls ces mots-ci se traduisent.
  // « Perdre du poids » et pas « perdre du gras » : le second demande de savoir
  // ce qu’on perd, ce que personne ne sait avant de commencer.
  "plan.goal.fat_loss.label": "Perdre du poids",
  "plan.goal.fat_loss.blurb":
    "Tu veux voir la balance descendre — sans que la semaine devienne invivable.",
  "plan.goal.muscle_gain.label": "Prendre du muscle",
  "plan.goal.muscle_gain.blurb":
    "Tu veux prendre, volontairement, et surtout du muscle.",
  "plan.goal.recomposition.label": "Même poids, autre silhouette",
  "plan.goal.recomposition.blurb":
    "La balance ne bouge presque pas. Ton tour de taille, si.",
  // « Mieux m'entraîner » et pas « Performance » : ce mot ressemblait à un
  // fourre-tout où tombait quiconque s'entraîne.
  "plan.goal.performance.label": "Mieux m’entraîner",
  "plan.goal.performance.blurb":
    "De quoi alimenter tes séances et récupérer. Le poids est une contrainte, pas la cible.",
  "plan.goal.health.label": "Mieux manger",
  "plan.goal.health.blurb":
    "Te sentir mieux au quotidien. Le poids du corps n’est pas le sujet ici.",
  "plan.goal.maintenance.label": "Garder ce que j’ai",
  "plan.goal.maintenance.blurb":
    "Tu es là où tu veux être. Reste-y, avec la charge la plus légère possible.",
  "plan.goal.legend": "Ce que tu cherches",

  "plan.goal.target_weight": "Le poids que je vise",
  "plan.goal.target_waist": "Le tour de taille que je vise",
  "plan.goal.target_band": "Le poids autour duquel je veux rester",
  "plan.goal.optional": "facultatif",
  "plan.goal.target_hint": "Il donne la direction sur laquelle tes portions sont calibrées. Ce n’est pas une échéance, et personne n’est noté là-dessus.",
  "plan.goal.axis_label": "La chose que je veux voir s’améliorer",
  "plan.goal.axis_none": "Rien en particulier",
  "plan.goal.axis_hint":
    "L’un des six que tu notes le dimanche — rien de plus à remplir.",
  "plan.goal.axis_unrated": "Rien de noté pour l’instant — tu le règles au point du dimanche.",
  "plan.goal.axis_last_sunday": "Dimanche dernier : {value} sur 5.",
  "plan.goal.axis_rising": "{axis} remonte — et c’est celui que tu as choisi.",
  "plan.goal.axis_falling": "{axis} baisse.",
  "plan.goal.axis_steady": "{axis} se maintient.",
  // L'étiquette d'axe porte déjà son article (« La qualité du sommeil »), donc
  // la phrase se construit avec « sur » et non avec un article de plus.
  "plan.goal.working_on": "tu travailles sur {axis}",
  "plan.goal.own_words": "Avec tes mots",
  "plan.goal.own_words_placeholder": "Jouer au foot avec mes enfants sans être détruit",
  "plan.goal.own_words_hint":
    "Facultatif. Pourquoi ça compte pour toi — ça vaut mieux qu’un chiffre.",

  "plan.measures.height": "Taille",
  "plan.measures.age": "Âge",
  "plan.measures.sex": "Sexe",
  "plan.measures.weight": "Poids",
  "plan.measures.waist": "Tour de taille",
  "plan.measures.target": "Cible",
  "plan.gender.female": "Femme",
  "plan.gender.male": "Homme",
  "plan.gender.other": "Autre",
  "plan.measures.week_of": "semaine du {date}",
  "plan.measures.since_sunday":
    "Tu t’es pesé depuis dimanche ? Ça va au même endroit que ton point du dimanche.",
  "plan.measures.none_yet":
    "Aucun poids enregistré pour l’instant. Ajoutes-en un ci-dessus, ou au point du dimanche.",
  "plan.measures.one_more":
    "Une saisie de plus et ça pourra montrer une direction — une mesure isolée n’est qu’un chiffre.",
  "plan.measures.band_unset":
    "Indique le poids autour duquel tu veux rester, et ça te dira quand tu t’en éloignes.",
  "plan.measures.weeks_in_range_one": "{count} semaine dans ta fourchette.",
  "plan.measures.weeks_in_range_many": "{count} semaines dans ta fourchette.",
  "plan.measures.drifted": "Tu es sorti de ta fourchette.",
  "plan.measures.week_by_week": "Semaine par semaine",
  "plan.measures.col_week": "Semaine",
  "plan.measures.col_change": "Écart",

  // Un couple par mesure ET par tendance : en français le verbe dépend de ce
  // qu'il décrit, et un adjectif interpolé demanderait un accord.
  "plan.trend.weight.rising": "ton poids monte",
  "plan.trend.weight.falling": "ton poids descend",
  "plan.trend.weight.stable": "ton poids se maintient",
  "plan.trend.waist.rising": "ton tour de taille augmente",
  "plan.trend.waist.falling": "ton tour de taille diminue",
  "plan.trend.waist.stable": "ton tour de taille se maintient",
  "plan.trend.and": " et ",
  "plan.trend.asked_for": "{observed} — c’est exactement ce que cet objectif demande.",

  "plan.summary.aiming_weight": "vise {value} kg",
  "plan.summary.aiming_waist": "vise {value} cm",
  "plan.summary.staying_around": "reste autour de {value} kg",
  "plan.summary.quoted": "« {text} »",
  "plan.summary.kept_one": "{count} chose gardée",
  "plan.summary.kept_many": "{count} choses gardées",

  "plan.input.numbers_only": "{field} : des chiffres uniquement.",
  "plan.input.out_of_range": "{field} : attendu entre {min} et {max}.",
  "plan.error.birth_date": "Cette date de naissance n’a pas l’air juste.",
  "plan.error.unknown_value": "Valeur inconnue.",
  "plan.error.no_profile": "Rien n’a été enregistré — ton profil est introuvable.",
  "plan.error.nothing_to_save":
    "Rien à enregistrer — indique un poids ou un tour de taille.",
  "plan.error.could_not_save": "enregistrement impossible",
  "plan.error.load": "Impossible de charger ta semaine.",
  "plan.error.failed": "Ça n’est pas passé.",


  // ══ LOT 1D · « CE QUE SOPHIA SAIT DE TOI » (/app/about-you) ═══════════════
  // Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §6 (les six sections,
  // dans l'ordre) et §7 (les anciennes notes, rendues telles quelles).
  //
  // ⛔ AUCUN GRAMME, AUCUNE CALORIE dans le bloc `known.portion.*`: la personne
  // dit « trop gros », pas « −80 g ». Les deux crans sont des ADVERBES, et
  // c'est l'enveloppe qui traduit en aval, là où le plancher TCA s'applique.
  //
  // ⚠️ `known.section.portions.not_wired` DIT UNE LIMITE VRAIE, et elle doit
  // disparaître le jour où elle cesse de l'être: le routage du lot 1C sert les
  // six familles aux générateurs, mais l'enveloppe ne lit pas encore les
  // ajustements de portion. Une copie d'écran ne promet pas plus que ce qui est.

  "known.title": "Ce que Sophia sait de toi",
  "known.subtitle": "Tout ce que je retiens, d'où ça vient, et comment le changer.",
  "known.intro": "Rien ici n'est caché, rien ici n'est figé. Chaque ligne dit qui l'a mise là, et chaque ligne se réécrit ou s'enlève.",
  "known.loading": "Je relis ce que j'ai gardé…",
  "known.no_goal": "Rien pour l'instant. Donne d'abord ta direction, et ce que tu me diras atterrira ici.",
  "known.section.no_more.title": "Ce que tu ne veux plus",
  "known.section.no_more.empty": "Cette liste est vide. Dis-le dans la conversation, ou coche-le au bilan d'un plan, et ça apparaîtra ici.",
  "known.section.again.title": "Ce que tu veux revoir",
  "known.section.again.empty": "Rien encore. Ce qui t'a plu atterrit ici dès que tu le dis.",
  "known.section.portions.title": "Les portions",
  "known.section.portions.empty": "Aucune portion n'a été ajustée. Cette question se pose à la fin d'un plan, avec la maison sous les yeux.",
  "known.index.portions.down": "Pour {who}, je sers des parts un peu plus petites que la base — c'est ce que tu as demandé au bilan.",
  "known.index.portions.down_strong": "Pour {who}, je sers des parts nettement plus petites que la base — c'est ce que tu as demandé au bilan.",
  "known.index.portions.up": "Pour {who}, je sers des parts un peu plus grandes que la base — c'est ce que tu as demandé au bilan.",
  "known.index.portions.up_strong": "Pour {who}, je sers des parts nettement plus grandes que la base — c'est ce que tu as demandé au bilan.",
  "known.section.rhythm.title": "Ton rythme",
  "known.section.rhythm.empty": "Rien de déclaré sur les moments de la journée qui existent, et pour qui.",
  "known.section.kitchen.title": "Ta cuisine",
  "known.section.kitchen.empty": "Rien sur les jours de cuisine, le temps aux fourneaux, la difficulté, la variété ou le budget.",
  "known.section.next_week.title": "Pour la semaine prochaine",
  "known.section.next_week.empty": "Rien de demandé pour la semaine prochaine. Ce qu'on demande ici vaut une semaine, puis s'en va.",
  "known.section.next_week.expires": "Valable jusqu'au {date}",
  "known.section.next_week.read_only": "Ces lignes s'en vont toutes seules, à la date ci-dessus. Elles ne s'éditent pas encore depuis ici.",
  "known.legacy.title": "Anciennes notes",
  "known.legacy.intro": "Des phrases gardées avant que j'aie des sections. Je ne devinerai pas où elles vont : range-en une toi-même et elle se déplace.",
  "known.legacy.empty": "Aucune.",
  "known.source.written": "Tu l'as écrit",
  "known.source.conversation": "Je l'ai retenu de ce que tu m'as dit {day}",
  "known.source.questionnaire": "Tu l'as coché au bilan d'un plan",
  "known.source.draft_note": "Tu l'as écrit sur une proposition de plan",
  "known.quote": "parce que tu as dit : {quote}",
  "known.recent.title": "Ce qui vient de changer",
  "known.memo.title": "Ce que Sophia a retenu d'autre",
  "known.memo.intro": "Des consignes qu'aucune section ne portait. {used} sur {max} — au-delà, il faut en enlever une avant qu'une nouvelle puisse entrer.",
  "known.field.moved": "de {previous} à {next}",
  "known.field.undo": "Défaire",
  "known.field.unset": "rien",
  "known.field.cook_days": "Jours de cuisine",
  "known.field.cooking_time_min": "Temps de cuisine",
  "known.field.budget_amount": "Budget",
  "known.field.recipe_difficulty": "Difficulté des recettes",
  "known.field.variety": "Variété",
  "known.field.eating_rhythm": "Rythme des repas",
  "known.recent.intro": "Je n'ai rien décidé en cachette : voilà ce que j'ai rangé récemment, et pourquoi. Enlève ce qui ne va pas.",
  "known.edit": "Modifier",
  "known.remove": "Enlever",
  "known.save": "Enregistrer",
  "known.cancel": "Annuler",
  "known.saving": "Enregistrement…",
  "known.edit_text_label": "La phrase que tu liras",
  "known.file_under": "Ranger dans",
  "known.file_under_keep": "La laisser en ancienne note",
  "known.kind.food_exclude": "Un aliment à ne plus servir",
  "known.kind.food_prefer": "Un aliment à revoir",
  "known.kind.method_avoid": "Une préparation qui ne passe pas",
  "known.kind.method_prefer": "Une préparation qui te plaît",
  "known.kind.portion_adjust": "La taille d'une part",
  "known.kind.rhythm_set": "Un moment qui existe, ou pas",
  "known.kind.logistics_set": "Comment ta cuisine tourne",
  "known.kind.craving": "Une envie ponctuelle",
  "known.portion.down_slight": "Un peu trop",
  "known.portion.down_clear": "Vraiment trop",
  "known.portion.up_slight": "Un peu trop peu",
  "known.portion.up_clear": "Vraiment pas assez",
  "known.portion.direction_label": "Trop, ou pas assez ?",
  "known.portion.direction_down": "Trop",
  "known.portion.direction_up": "Pas assez",
  "known.portion.magnitude_label": "À quel point ?",
  "known.portion.magnitude_slight": "Un peu",
  "known.portion.magnitude_clear": "Nettement",
  "known.portion.not_for": "Ne s'applique pas à {names}. Je ne réduis pas l'assiette d'un enfant qui grandit sur une remarque qui ne nommait personne.",
  "known.portion.not_for_gone": "Ça visait quelqu'un qui a quitté la maison : ça ne s'applique à personne.",
  "known.rhythm.present": "{occasion} — oui, ce moment existe",
  "known.rhythm.absent": "{occasion} — non, pas ce moment-là",
  "known.logistics.cook_days": "Jours de cuisine : {days}",
  "known.logistics.cooking_time_min": "Jusqu'à {n} min aux fourneaux",
  "known.logistics.recipe_difficulty": "Recettes : {level}",
  "known.logistics.variety": "Variété : {level}",
  "known.logistics.budget_amount": "Budget : {amount}",
  "known.difficulty.simple": "simples",
  "known.difficulty.normal": "normales",
  "known.difficulty.keen": "ambitieuses",
  "known.variety.repeat": "répéter, ça me va",
  "known.variety.some": "un peu de variété",
  "known.variety.varied": "très variées",
  "known.subject.household": "Tout le monde à table",
  "known.subject.gone": "Quelqu'un qui a quitté la maison",
  "known.refused.body": "{count} lignes enregistrées n'ont pas pu être relues : elles ne sont pas affichées ici. Elles sont gardées telles quelles — rien n'est supprimé, et chaque enregistrement les remet intactes.",
  "known.store_unreadable": "L'un des deux magasins n'est pas une liste du tout : il n'y a nulle part où remettre ce que je ne sais pas lire. Je refuse d'écrire par-dessus : tant qu'il n'est pas réparé, l'enregistrement est refusé ici, et rien de ce qu'il contient n'est perdu.",
  "known.detail_locked": "Le détail en dessous — le moment, les jours, le nombre — se règle sur son écran à lui et ne change pas ici. Seule cette phrase change.",
  "known.error.load": "Je n'ai pas pu lire ça : {message}",
  "known.error.no_write_port": "Cet écran ne peut pas encore enregistrer : sa porte d'écriture n'est pas installée. Rien n'a été écrit, rien n'a été perdu.",
  "known.error.stale_snapshot": "Quelque chose a changé ici pendant que tu modifiais. Recharge et recommence — je préfère refuser plutôt qu'écraser.",
  "known.error.write_failed": "L'enregistrement n'est pas passé, et je ne sais pas te dire pourquoi. Rien n'a été écrit, et rien n'a été perdu.",
  "known.error.opaque_store": "Rien n'a été écrit : l'un des deux magasins n'est pas une liste, et écrire par-dessus aurait détruit ce que je ne sais pas lire.",
  "known.error.no_goal_row": "Il n'y a encore rien où écrire. Donne d'abord ta direction.",
  "known.error.no_user": "Tu n'es plus connecté.",
  "known.error.bad_items": "J'ai refusé cette forme plutôt que d'enregistrer quelque chose que je ne saurais pas relire.",
  "known.error.unreadable": "Je n'ai pas su en faire une ligne. Rien n'a été changé.",
  "known.error.generic": "Ça n'est pas passé, et rien n'a bougé.",
  "app.nav.about_you": "Ce que Sophia sait",

};
