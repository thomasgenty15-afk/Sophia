// KEEL — le pack FRANÇAIS de la vitrine.
//
// Périmètre: les namespaces listés dans `PUBLIC_NAMESPACES` (catalog.ts), et
// EXACTEMENT eux. Le type `PublicMessages` est dérivé du seed anglais: une clé
// ajoutée à `en.ts` sous un namespace public casse la compilation de ce fichier
// tant qu'elle n'est pas traduite. C'est la seule garantie qui tienne — un
// `Partial` avec repli anglais produirait un écran français avec une phrase
// anglaise au milieu, découvert par un client et pas par un test.
//
// CE N'EST PAS UNE TRADUCTION LITTÉRALE. C'est une page de vente: elle est
// réécrite pour sonner juste en français, pas transposée mot à mot. Les
// tournures anglaises (« Your course ends. Your coaching doesn't. ») ont un
// rythme qui ne survit pas au calque.
//
// Ce qui NE se traduit pas: le nom de marque, l'adresse e-mail, et les prix
// (ce sont des faits commerciaux, pas de la langue).

import type { PublicMessages } from "./catalog";

export const fr: PublicMessages = {
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
  "public.nav.mealprep": "Batch cooking",
  "public.nav.couples": "En couple",
  "public.nav.families": "En famille",
  "public.nav.coaches": "Formations",
  "public.nav.gyms": "Salles de sport",
  "public.nav.communities": "Communautés",
  "public.footer.tagline": "Ta méthode, qui répond en ton absence.",
  "public.footer.legal": "Mentions légales & confidentialité",
  "public.footer.contact": "Contact",
  "public.footer.contact_email": "sophia@sophia-coach.ai",
  "public.footer.copyright": "Sophia — logiciel de coaching",

  // ── /auth — LA PORTE UNIQUE DU PRODUIT ───────────────────────────────────
  //
  // ⚠️ VOUVOIEMENT, ET C'EST UN ARBITRAGE ASSUMÉ. Le site n'a pas une seule
  // adresse: `/`, `/pro`, `/couples`, `/families`, `/gyms`, `/communities` et
  // le chrome disent « vous »; `/meal-prep`, `/coaches` et `/start` disent
  // « tu ». Cet écran-ci est la porte des DEUX mondes — un coach y crée un
  // compte professionnel — et c'est le moment le plus formel du site: on y
  // confie un mot de passe. Il prend donc le registre majoritaire.
  // Conséquence à connaître: le lien « Créer un compte gratuit » atterrit sur
  // `/start`, qui tutoie. Le raccord est visible, il appartient au lot qui
  // uniformisera le registre du site, pas à celui-ci.
  //
  // Les quatre clés `auth.coach_link.*` plus bas ont été REPASSÉES au
  // vouvoiement pour la même raison: elles vivaient seules, tutoyantes, au
  // milieu d'un écran anglais.
  "auth.seo.title": "Connexion",
  "auth.seo.title_coach": "Compte coach",
  "auth.seo.description":
    "Connectez-vous à Sophia, ou ouvrez le compte qui vous y fait entrer : pour un foyer, ou pour un coach et ses élèves.",

  // Le fronton de la fiche — le nom du document, qui change avec son état.
  "auth.sheet.signin": "Connexion",
  "auth.sheet.coach": "Compte coach",
  "auth.sheet.reset": "Mot de passe",
  "auth.sheet.confirm": "Vérification de l’e-mail",

  "auth.signin.title": "Vous revoilà.",
  "auth.signin.lede": "La même porte pour les foyers et pour les coachs.",
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
  "auth.field.country": "Pays",
  "auth.field.country_placeholder": "Choisissez un pays",
  "auth.field.country_hint":
    "Le pays où vous exercez. Il décide des ressources d’urgence servies à vos élèves, et il n’est jamais déduit de votre langue.",
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
  "auth.doors.household.label": "Foyer",
  "auth.doors.household.body":
    "Ouvrez votre compte et composez votre semaine autour de qui mange à votre table.",
  "auth.doors.household.cta": "Créer un compte gratuit",
  "auth.doors.household.prompt": "Vous cuisinez pour votre foyer ?",
  "auth.doors.pro.label": "Professionnel",
  "auth.doors.pro.body":
    "Écrivez votre méthode une fois. Vos élèves composent leur semaine dedans.",
  "auth.doors.coach_divider_signup": "Vous avez déjà un compte coach ?",
  "auth.doors.coach_divider_signin": "Pas encore de compte coach ?",

  "auth.error.legal":
    "Acceptez les conditions générales et la politique de confidentialité pour continuer.",
  "auth.error.country": "Choisissez le pays où vous exercez.",
  "auth.error.student_signup_moved":
    "L’inscription élève a déménagé. Ouvrez /start pour créer votre compte, ou utilisez le lien que votre coach vous a envoyé.",
  "auth.error.prelaunch_signup":
    "L’inscription est fermée (pré-lancement). Connectez-vous avec le compte master_admin.",
  "auth.error.prelaunch_forbidden":
    "L’accès est restreint (pré-lancement). Seul le compte master_admin peut se connecter.",
  "auth.error.coach_profile":
    "Votre compte existe, mais le profil coach n’a pas pu être créé. Reconnectez-vous pour réessayer.",
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

  "auth.country.us": "États-Unis",
  "auth.country.gb": "Royaume-Uni",
  "auth.country.fr": "France",
  "auth.country.ca": "Canada",
  "auth.country.au": "Australie",
  "auth.country.ie": "Irlande",
  "auth.country.nz": "Nouvelle-Zélande",
  "auth.country.be": "Belgique",
  "auth.country.ch": "Suisse",
  "auth.country.de": "Allemagne",
  "auth.country.es": "Espagne",
  "auth.country.it": "Italie",
  "auth.country.nl": "Pays-Bas",
  "auth.country.pt": "Portugal",
  "auth.country.se": "Suède",
  "auth.country.sg": "Singapour",
  "auth.country.ae": "Émirats arabes unis",
  "auth.country.za": "Afrique du Sud",

  // ── Passerelles d'authentification ───────────────────────────────────────
  "auth.coach_link.prompt": "Vous êtes coach ?",
  "auth.coach_link.cta": "Créer un compte coach",
  "auth.coach_link.back_prompt": "Vous n’êtes pas coach ?",
  "auth.coach_link.back_cta": "Aller à la connexion classique",

  // ── SEO ──────────────────────────────────────────────────────────────────
  // ── HOME — le hall du foyer (`/`) ───────────────────────────────────────
  "home.seo_title": "Sophia — une seule casserole, et la part de chacun écrite",
  "home.seo_description":
    "Sophia compose la semaine d'une maison en sessions de cuisine : le même plat pour tout le monde, et pour chaque bouche la part qui va avec sa direction. L'allergie d'une seule personne gouverne toute la casserole.",
  "home.hero.kicker": "Pour qui fait la cuisine de la maison",
  "home.hero.title": "Une seule casserole. La part de chacun, écrite.",
  "home.hero.lede":
    "Sophia compose votre semaine en sessions de cuisine, pas en plats isolés. Un plat part sur la table, et chacun reçoit l'instruction de service qui va avec.",
  "home.hero.cta": "Commencer",
  "home.hero.price":
    "12,99 € par mois pour le foyer, plus 2 € par personne qui réclame son propre accès. Votre place n'est jamais comptée, et les enfants comptent comme des bouches, pas comme des comptes.",
  "home.fig.alt":
    "Une casserole et deux assiettes : le même plat, décrit différemment pour deux personnes.",
  "home.fig.pot": "le même plat",
  "home.fig.one": "POUR L'UN",
  "home.fig.one_2": "plus de féculents",
  "home.fig.two": "POUR L'AUTRE",
  "home.fig.two_2": "plus de légumes",
  "home.fig.caption":
    "Le plat est le même. Ce qui change, c'est la part qui va avec, décrite en mots — c'est ainsi que le produit le dit.",
  "home.proof.kicker": "Ce qu'il refuse de faire",
  "home.proof.title": "L'allergie d'une seule personne gouverne toute la casserole.",
  "home.proof.body":
    "Les contraintes de toutes les bouches du foyer sont réunies avant que le plan existe. Si cet ensemble ne peut pas être lu, rien n'est composé : Sophia s'arrête et nomme la raison. Un plan qui manque se redemande ; un plan qui a supposé se mange.",
  "home.doors.kicker": "Où vous en êtes",
  "home.doors.title": "Trois façons de manger à la maison. La vôtre en est une.",
  "home.door.mealprep.label": "Cuisiner pour soi",
  "home.door.mealprep.title": "Vous faites déjà du batch cooking",
  "home.door.mealprep.body":
    "Vous cuisinez une fois pour plusieurs jours, et vous avez une direction — perdre ou prendre. La semaine arrive en sessions de cuisine, et les courses tombent en vagues qui suivent ce qui reste frais.",
  "home.door.mealprep.cta": "Voir pour une personne",
  "home.door.couples.label": "À deux",
  "home.door.couples.title": "Deux objectifs, une seule cuisine",
  "home.door.couples.body":
    "Deux directions qui divergent, ça veut dire deux casseroles — et deux casseroles, ça veut dire que ni l'un ni l'autre ne tient. Un plat, deux parts décrites pour deux objectifs.",
  "home.door.couples.cta": "Voir pour deux",
  "home.door.families.label": "À trois ou plus",
  "home.door.families.title": "Des besoins différents à la même table",
  "home.door.families.body":
    "Les enfants sont dans le plan sans compte et sans écran. Les allergies sont réunies pour tout le monde, et un mineur ne reçoit jamais de cible nutritionnelle.",
  "home.door.families.cta": "Voir pour une famille",
  "home.close.title": "Commencez seul. Ajoutez les autres quand vous voulez.",
  "home.close.body":
    "Le produit livre sa valeur entière à une seule personne dès le premier jour — les sessions, les parts qui suivent votre direction, les courses en vagues. Le reste du foyer est un ajout, jamais une condition pour que ce soit bon.",
  "home.close.cta": "Commencer",

  // ── PRO — le hall des professionnels (`/pro`) ───────────────────────────
  "pro.seo_title": "Sophia pour les pros — votre méthode, qui répond chaque jour",
  "pro.seo_description":
    "Vous enregistrez une fois votre façon de nourrir ; Sophia répond à vos élèves avec votre méthode et vos mots. Ce qu'elle écrit dans leur conversation est relu contre vos lignes rouges avant l'envoi, sans modèle dans cette boucle. 7 € par élève et par mois, sans forfait plateforme.",
  "pro.hero.kicker": "Pour ceux qui vendent une méthode, pas des heures",
  "pro.hero.title": "Votre méthode, écrite une fois. Relue avant chaque envoi.",
  "pro.hero.lede":
    "Sophia apprend votre façon de nourrir — vos convictions, vos lignes rouges, les arbitrages que vous faites sur les cas difficiles — et répond à vos élèves à votre place. Votre méthode entre dans leur conversation, dans chaque semaine et dans chaque repas qu'elle rédige ; et ce qu'elle écrit dans cette conversation est relu contre vos lignes rouges avant de partir, par du code.",
  "pro.hero.cta": "Démarrer l'essai de 14 jours",
  "pro.hero.note":
    "14 jours, jusqu'à 3 élèves, puis ça s'arrête tout seul. Ensuite 7 € par élève et par mois — le siège est le seul poste, il n'y a pas de forfait plateforme.",
  "pro.fig.alt":
    "Votre méthode et vos lignes rouges entrent ; ce qui va partir est relu, et ce qui franchit une ligne est retenu et remplacé.",
  "pro.fig.method": "VOTRE MÉTHODE",
  "pro.fig.method_2": "écrite une fois",
  "pro.fig.lines": "VOS LIGNES ROUGES",
  "pro.fig.lines_2": "et ce que vous faites",
  "pro.fig.check": "relu",
  "pro.fig.sent": "ENVOYÉ",
  "pro.fig.held": "RETENU",
  "pro.fig.held_2": "dans vos mots",
  "pro.fig.caption":
    "La moitié du haut est une consigne, et une consigne est suivie presque toujours. Celle du bas n'en est pas une : c'est une relecture de ce qui va partir, sans modèle dans cette boucle. Deux mécanismes qui échouent différemment.",
  "pro.proof.kicker": "Ce que reçoit votre élève",
  "pro.proof.title": "Jamais un refus. Jamais « demande à ton coach ».",
  "pro.proof.body":
    "Chaque ligne rouge porte ce que vous faites à la place, dans vos mots, et c'est cela qui part — signé de votre nom. Votre élève ne rencontre jamais un mur, ce qui compte ici plus qu'ailleurs : il n'existe aucun canal en tête-à-tête qui vous ramène à lui, et cette absence est le produit.",
  "pro.doors.kicker": "Ce que vous faites tourner",
  "pro.doors.title": "Trois façons de vendre une méthode.",
  "pro.door.coaches.label": "Une formation",
  "pro.door.coaches.title": "Vous vendez une formation",
  "pro.door.coaches.body":
    "Votre formation se termine, votre coaching non. Une méthode que vous ne pouviez vendre qu'une fois devient quelque chose qu'on paie chaque mois.",
  "pro.door.coaches.cta": "Voir pour une formation",
  "pro.door.gyms.label": "Une salle",
  "pro.door.gyms.title": "Vous tenez une salle indépendante",
  "pro.door.gyms.body":
    "Vous coachez trois heures par semaine ; vingt et un repas se passent sans vous. C'est là que le palier arrive, et le membre qui ne voit rien changer ne vient pas vous le dire — il part.",
  "pro.door.gyms.cta": "Voir pour une salle",
  "pro.door.communities.label": "Une communauté",
  "pro.door.communities.title": "Vous tenez une communauté payante",
  "pro.door.communities.body":
    "Un fil n'a pas de destinataire — c'est de l'architecture, pas de la charge de travail. Sophia est la couche individuelle qui se pose sous ce que vous avez déjà construit.",
  "pro.door.communities.cta": "Voir pour une communauté",
  "pro.close.title":
    "Nous n'avons pas de chiffre de rétention à vous vendre, et nous n'allons pas en inventer un.",
  "pro.close.body":
    "Rien dans ce produit ne mesure le churn contre un témoin : un chiffre écrit ici ne serait que de la décoration. Ce que vaut un élève qui reste, c'est votre chiffre, pas le nôtre.",
  "pro.close.cta": "Démarrer l'essai de 14 jours",

  // ── LES SIX PAGES DE VENTE ───────────────────────────────────────────
  // Le français n'est PAS un calque: c'est une page de vente, réécrite
  // pour sonner juste. Les prix, la marque et l'e-mail ne se traduisent
  // pas. Les chaînes qu'une maquette annonce « mot pour mot » restent en
  // anglais: l'app authentifiée est anglaise, et traduire la citation
  // montrerait un écran qui n'existe pas.
  //
  // ⚠️ Le bloc `landing.*` a été retiré — voir `en.ts`.

  // ── MEALPREP ──────────────────────────────────────────────────────────
  "mealprep.seo_title":
    "Meal prep pour une personne — une semaine en sessions de cuisine",
  "mealprep.seo_description":
    "Tu cuisines une fois et tu manges plusieurs jours. Sophia compose ta semaine dans cette unité\u00A0: des sessions de cuisine, des courses qui arrivent en vagues, et trois gestes quand un soir tombe à l’eau. 12,99\u00A0€ par mois, entier pour une seule personne.",

  // ── Hero ────────────────────────────────────────────────────────────────
  "mealprep.hero.kicker": "Pour une personne seule, entier dès le premier jour",
  "mealprep.hero.title": "Cuisiner n’est pas le plus dur. Décider, si.",
  "mealprep.hero.lede":
    "Tu cuisines déjà une fois pour plusieurs jours. Sophia compose ta semaine dans cette unité-là — la session de cuisine — autour de l’objectif que tu poses, et laisse les courses suivre.",
  "mealprep.cta": "Commencer",
  "mealprep.hero.price_note":
    "12,99\u00A0€ par mois. Seul, c’est le produit entier, pas une version réduite.",

  "mealprep.fig.session.title": "Une session de cuisine, plusieurs repas prêts",
  "mealprep.fig.session.desc":
    "Une casserole vue de dessus. Un peigne de traits la relie à des contenants identiques — le même dessin réemployé, parce que c’est la même cuisson — qui couvrent les repas des jours suivants.",
  "mealprep.fig.session.label": "UNE SESSION DE CUISINE",
  "mealprep.fig.session.pot": "une session",
  "mealprep.fig.session.covers": "CE QU’ELLE COUVRE",

  // ── Ce que ce n'est pas (bloc sombre) ───────────────────────────────────
  "mealprep.quiet.kicker": "Ce que ce n’est pas",
  "mealprep.quiet.title": "Pas de score. Pas de série.",
  "mealprep.quiet.numbers_label": "Les chiffres",
  "mealprep.quiet.numbers_value":
    "Éteints par défaut — ce qui n’est pas la même chose qu’absents. Les allumer est un choix délibéré, et une chaîne de gardes décide si c’est seulement possible.",
  "mealprep.quiet.ranking_label": "Le classement",
  "mealprep.quiet.ranking_value":
    "Il n’y en a pas. Rien ne note ta semaine, et aucune bande de couleur ne te dit comment elle s’est passée.",
  "mealprep.quiet.left_label": "Ce qui reste",
  "mealprep.quiet.left_value":
    "Ce que tu cuisines, quand tu le cuisines, et les courses qui vont avec.",

  // ── Les courses ─────────────────────────────────────────────────────────
  "mealprep.waves.kicker": "Les courses",
  "mealprep.waves.title": "Les courses arrivent en vagues, pas en un seul chariot.",
  "mealprep.waves.body":
    "Une vague ne demande jamais au frais de dormir plus de trois jours au frigo. Ce qui est acheté trop tôt finit à la poubelle\u00A0: quand cette fenêtre se ferme, la vague suivante part, et la fin de ta semaine s’achète à la fin de ta semaine.",
  "mealprep.waves.reserve":
    "Et quand une semaine tient en une seule vague, tu en vois une. Le produit n’en invente pas une deuxième pour avoir l’air occupé.",

  "mealprep.fig.waves.title": "Les courses réparties en vagues sur la semaine",
  "mealprep.fig.waves.desc":
    "Deux paniers — le même dessin, deux fois — posés au-dessus des jours qu’ils couvrent. Le premier tient sur trois jours, la durée pendant laquelle le frais a le droit d’attendre. Le second continue, ouvert.",
  "mealprep.fig.waves.label": "LES COURSES EN VAGUES",
  "mealprep.fig.waves.first": "PREMIÈRE VAGUE",
  "mealprep.fig.waves.next": "VAGUE SUIVANTE",
  "mealprep.fig.waves.fresh": "TROIS JOURS",
  "mealprep.fig.waves.week": "LA SEMAINE",

  // ── L'imprévu ───────────────────────────────────────────────────────────
  "mealprep.moves.kicker": "Quand un soir tombe à l’eau",
  "mealprep.moves.title": "Un soir manqué ne refait pas la semaine.",
  "mealprep.moves.body":
    "Trois gestes, proposés en boutons dans le fil\u00A0: décaler un plat, décaler toute la session, ou dire que tu ne cuisines pas ce soir. La semaine encaisse et se réaligne autour.",
  "mealprep.moves.note":
    "Aucun plat n’est choisi à ta place, et la semaine n’est pas réécrite dans ton dos.",

  "mealprep.fig.moves.title": "Les trois gestes qu’une semaine accepte",
  "mealprep.fig.moves.desc":
    "Trois cartes, un geste par carte. Sur la première, un plat quitte son soir. Sur la deuxième, la session qui l’entoure part avec lui. Sur la troisième, le soir reste vide et rien n’est cuisiné.",
  "mealprep.fig.moves.label": "TROIS GESTES",
  "mealprep.fig.moves.dish": "DÉCALER UN PLAT",
  "mealprep.fig.moves.session": "DÉCALER LA SESSION",
  "mealprep.fig.moves.tonight": "PAS CE SOIR",

  // ── Le prix et l'entrée ─────────────────────────────────────────────────
  "mealprep.start.kicker": "Pour commencer",
  "mealprep.start.title": "12,99\u00A0€ par mois. Seul, tu as tout.",
  "mealprep.start.body":
    "Tu achètes un foyer d’une personne, et un foyer d’une personne est un foyer complet. D’autres bouches pourront s’y ajouter plus tard\u00A0; ce n’est pas ce que tu achètes aujourd’hui.",
  "mealprep.start.price": "12,99\u00A0€",
  "mealprep.start.period": "par mois",
  "mealprep.start.price_label": "Un foyer. À une personne, il est déjà entier.",
  "mealprep.start.asks_label": "Ce qu’on te demande",
  "mealprep.start.ask_name": "Prénom",
  "mealprep.start.ask_birthdate": "Date de naissance",
  "mealprep.start.ask_goal": "Objectif",
  "mealprep.start.ask_allergies": "Allergies",
  "mealprep.start.note": "Ensuite Sophia compose la première semaine, en sessions.",

  // ── COUPLES ───────────────────────────────────────────────────────────
  // ── SEO ────────────────────────────────────────────────────────────────────
  "couples.seo_title": "Deux objectifs, une seule casserole",
  "couples.seo_description":
    "L’un veut prendre, l’autre veut perdre. Sophia compose la semaine de votre foyer en sessions de cuisine : un plat, et pour chacun la part qui va avec son objectif, écrite en mots. 12,99 € par mois pour le foyer.",

  // ── HERO ───────────────────────────────────────────────────────────────────
  "couples.hero.kicker": "À deux",
  "couples.hero.title": "Deux objectifs. Une seule casserole.",
  "couples.hero.lede":
    "Vous ne visez pas la même chose, et vous dînez quand même ensemble. Sophia compose la semaine de votre foyer en sessions de cuisine : un plat, et pour chacun la part qui va avec son objectif — en mots, jamais en grammes, et jamais dans une deuxième poêle.",
  "couples.hero.cta": "Commencer",
  "couples.hero.price":
    "12,99 € par mois pour le foyer, 2 € par mois pour un second profil. Le compte que vous ouvrez n’est jamais compté en plus.",
  "couples.hero.reserve":
    "L’inscription ouvre quand le programme du coach maison est publié.",
  "couples.hero.caption":
    "Un exemple. Six objectifs envoient chacun la part dans leur direction.",

  // ── LA BANDE DE FAITS, sous le hero ────────────────────────────────────────
  "couples.facts.unit.label": "L’unité",
  "couples.facts.unit.title": "La session de cuisine",
  "couples.facts.unit.body":
    "Vous ne planifiez pas sept dîners. Vous planifiez les fois où la cuisine s’allume, et ce qu’elles couvrent.",

  "couples.facts.direction.label": "La direction",
  "couples.facts.direction.title": "Six objectifs, six directions",
  "couples.facts.direction.body":
    "Votre objectif décide du sens de votre part. Ce que vous avez en commun est cuit une fois ; le reste est une instruction de service.",

  "couples.facts.words.label": "Les mots",
  "couples.facts.words.title": "Une phrase, pas un chiffre",
  "couples.facts.words.body":
    "La ligne de service de chaque bouche apparaît sur l’écran du foyer. Elle est écrite en mots ; aucun écran ne vous rend un gramme.",

  // ── SECTION 2 — l'autre personne ───────────────────────────────────────────
  "couples.other.kicker": "Le second profil",
  "couples.other.title": "Un seul de vous deux a besoin de s’en occuper.",
  "couples.other.lede":
    "L’autre est dans le plan, avec ou sans compte : sa part se calcule sur son objectif, à côté de la vôtre. Pour avoir son propre accès — son objectif, modifiable quand on veut, sa ligne de service — le profil réclamé coûte 2 € par mois. Le compte que vous ouvrez, lui, n’est jamais compté en plus.",
  "couples.other.asked":
    "Ce qu’on demande pour l’ajouter : un prénom, une date de naissance, un objectif, les allergies.",

  // ── SECTION 3 — la semaine encaisse ────────────────────────────────────────
  "couples.week.kicker": "Quand ça dérape",
  "couples.week.title": "La semaine encaisse sans être refaite.",
  "couples.week.lede":
    "L’un rentre tard et le plan ne s’écroule pas. Dans le chat, on décale un plat, on décale la session entière, on dit que personne ne cuisine ce soir — ou que rien n’a besoin de changer. Ce sont les quatre réponses, et il n’y en a pas de cinquième : rien ne choisit un nouveau plat à votre place.",

  // ── SECTION 4 — le bloc sombre ─────────────────────────────────────────────
  "couples.dark.kicker": "Ce que nous ne faisons pas",
  "couples.dark.say":
    "Il n’y a pas de courbe de poids ici, et pas de balance à ouvrir le matin.",
  "couples.dark.note":
    "Les chiffres sont éteints par défaut, et quatre verrous décident si on peut les allumer. Deux personnes qui dînent ne sont pas un tableau de bord.",

  // ── SECTION 5 — le prix et le geste ────────────────────────────────────────
  "couples.price.kicker": "Le prix",
  "couples.price.title": "Un foyer, un prix.",
  "couples.price.amount": "12,99 €",
  "couples.price.period": "par mois, pour le foyer",
  "couples.price.label":
    "Le second profil réclamé est à 2 € par mois. Jusqu’à huit bouches. Le compte que vous ouvrez n’est jamais compté.",
  "couples.price.note":
    "À l’inscription, vous dites combien vous êtes à table, et le parcours à deux est celui sur lequel vous tombez.",

  // ── FIGURE A — une casserole, deux parts ───────────────────────────────────
  "couples.fig.plates.title": "Une casserole, deux parts",
  "couples.fig.plates.desc":
    "Une casserole vue de dessus. Deux assiettes identiques reçoivent le même plat. Ce qui diffère entre les deux n’est pas dessiné : c’est l’instruction de service, écrite en mots à côté de chaque assiette.",
  "couples.fig.plates.eyebrow": "UNE SESSION DE CUISINE, DEUX PARTS",
  "couples.fig.plates.pot": "le même plat, cuit une fois",
  "couples.fig.plates.goal_a": "PRENDRE DU MUSCLE",
  "couples.fig.plates.note_a1": "plus de féculents",
  "couples.fig.plates.note_a2": "dans cette part",
  "couples.fig.plates.goal_b": "PERDRE DU GRAS",
  "couples.fig.plates.note_b1": "plus de légumes",
  "couples.fig.plates.note_b2": "dans cette part",

  // ── FIGURE B — qui est dans le plan ────────────────────────────────────────
  "couples.fig.who.title": "Qui est dans le plan",
  "couples.fig.who.desc":
    "Le même foyer, deux façons d’en être. Sans compte, l’autre est quand même une bouche du foyer et reçoit quand même sa part. Le profil réclamé ajoute son propre accès, pour deux euros par mois.",
  "couples.fig.who.eyebrow": "QUI EST DANS LE PLAN",
  "couples.fig.who.col_a": "SANS COMPTE",
  "couples.fig.who.a1": "une bouche du foyer",
  "couples.fig.who.a2": "sa part est écrite",
  "couples.fig.who.a3": "inclus",
  "couples.fig.who.col_b": "PROFIL RÉCLAMÉ",
  "couples.fig.who.b1": "son propre accès",
  "couples.fig.who.b2": "son objectif, modifiable",
  "couples.fig.who.b3": "2 € par mois",
  "couples.fig.who.foot": "le compte qui ouvre le foyer n’est jamais compté",

  // ── FIGURE C — les quatre réponses ─────────────────────────────────────────
  "couples.fig.chat.title": "Les quatre réponses quand la soirée tombe",
  "couples.fig.chat.desc":
    "Dans le chat, une soirée qui tombe a exactement quatre réponses : décaler ce plat, décaler la session, personne ne cuisine ce soir, ou rien à changer. Aucune ne refait la semaine.",
  "couples.fig.chat.eyebrow": "CE SOIR NE SE PASSE PAS COMME PRÉVU",
  "couples.fig.chat.label": "DANS LE CHAT",
  "couples.fig.chat.said": "Le dîner de ce soir ne se fera pas.",
  "couples.fig.chat.b1": "décaler ce plat",
  "couples.fig.chat.b2": "décaler la session",
  "couples.fig.chat.b3": "personne ne cuisine ce soir",
  "couples.fig.chat.b4": "rien à changer",
  "couples.fig.chat.foot": "la semaine n’est pas refaite",

  // ── FAMILIES ──────────────────────────────────────────────────────────
  "families.seo_title": "Une casserole pour un foyer aux besoins différents",
  "families.seo_description":
    "Sophia compose la semaine du foyer autour de chaque bouche de la table : l’allergie d’une seule gouverne toute la casserole, et quand les contraintes du foyer ne sont pas lisibles, rien n’est composé. 12,99 € par mois pour le foyer entier, jusqu’à huit bouches.",

  // ── Héros ────────────────────────────────────────────────────────────────
  "families.hero.kicker": "Trois bouches à nourrir, ou plus",
  "families.hero.title":
    "L’allergie d’une seule bouche gouverne toute la casserole.",
  "families.hero.lede":
    "Une casserole pour toute la table. L’exception ne se rattrape pas au moment de servir : les contraintes de toutes les bouches sont réunies avant que le plan existe, et si cette union ne peut pas être lue, rien n’est composé. Sophia refuse plutôt que de deviner.",
  "families.hero.cta": "Créer votre foyer",
  "families.hero.price_note":
    "12,99 € par mois, le foyer entier. Une bouche de plus ne change pas le prix.",

  "families.fig_pot.label": "LA TABLE GOUVERNE LA CASSEROLE",
  "families.fig_pot.a11y_title": "Les bouches du foyer, et la casserole",
  "families.fig_pot.a11y_desc":
    "Quatre bouches sont listées avec leurs allergies. Une seule porte une contrainte. Les quatre lignes se rassemblent en un seul trait qui entre dans la casserole : toute la casserole est composée sans cet aliment.",
  "families.fig_pot.col_mouths": "LES BOUCHES",
  "families.fig_pot.col_allergies": "ALLERGIES",
  "families.fig_pot.m1": "Vous",
  "families.fig_pot.m2": "Sami, 9 ans",
  "families.fig_pot.m2_allergy": "arachide",
  "families.fig_pot.m3": "Inès, 6 ans",
  "families.fig_pot.m4": "Jo",
  "families.fig_pot.none": "aucune",
  "families.fig_pot.pot_label": "TOUTE LA CASSEROLE",
  "families.fig_pot.pot_value": "composée sans arachide",

  // ── Le refus ─────────────────────────────────────────────────────────────
  "families.refusal.kicker": "Le refus",
  "families.refusal.title": "Quand la maison n’est pas lisible, rien n’est composé.",
  "families.refusal.body":
    "Les allergies de chaque bouche sont réunies en une seule contrainte, lue au moment où la semaine se fabrique. Si elle ne peut pas être lue, la fabrication s’arrête et nomme la raison. Elle ne compose pas une version prudente, elle ne prend pas le milieu des cas : elle s’arrête. C’est le sens de fail-closed — ici, le défaut, c’est le refus.",
  "families.refusal.line":
    "Un plan qui manque se redemande. Un plan qui a supposé se mange.",

  "families.fig_gate.label": "AVANT QUE LA SEMAINE EXISTE",
  "families.fig_gate.a11y_title": "Les deux sorties de la génération",
  "families.fig_gate.a11y_desc":
    "Les contraintes du foyer sont lues avant que la semaine se compose. Si elles sont lisibles, la semaine se compose. Si elles ne le sont pas, rien n’est composé et la génération s’arrête en nommant la raison.",
  "families.fig_gate.in_label": "LES CONTRAINTES",
  "families.fig_gate.in_value": "de toutes les bouches",
  "families.fig_gate.ok_label": "LISIBLES",
  "families.fig_gate.ok_value": "la semaine se compose",
  "families.fig_gate.no_label": "ILLISIBLES",
  "families.fig_gate.no_value": "rien n’est composé",
  "families.fig_gate.code": "safety_constraints_unreadable",

  // ── Les bouches sans compte ──────────────────────────────────────────────
  "families.mouths.kicker": "Les bouches sans compte",
  "families.mouths.title": "Vos enfants sont dans le plan. Ils n’ont ni compte, ni écran.",
  "families.mouths.body":
    "Une bouche existe par ce que vous en écrivez : prénom, date de naissance, objectif, allergies. C’est tout ce qu’on demande, et c’est vous qui l’écrivez — pas de mot de passe à créer pour un enfant de six ans, pas de profil à lui faire remplir, pas un écran de plus dans la maison.",

  "families.fig_sheet.label": "UNE BOUCHE, QUATRE CHAMPS",
  "families.fig_sheet.a11y_title": "Ce qu’on demande pour une bouche, et qui a un compte",
  "families.fig_sheet.a11y_desc":
    "À gauche, les quatre champs demandés pour ajouter une bouche : prénom, date de naissance, objectif, allergies. À droite, trois bouches du foyer : une seule a un compte, les deux autres existent dans le plan sans compte ni écran.",
  "families.fig_sheet.asked": "CE QU’ON DEMANDE",
  "families.fig_sheet.f1": "prénom",
  "families.fig_sheet.f2": "date de naissance",
  "families.fig_sheet.f3": "objectif",
  "families.fig_sheet.f4": "allergies",
  "families.fig_sheet.m1": "Vous",
  "families.fig_sheet.m2": "Sami, 9 ans",
  "families.fig_sheet.m3": "Inès, 6 ans",
  "families.fig_sheet.has_account": "UN COMPTE",
  "families.fig_sheet.no_account": "SANS COMPTE",
  "families.fig_sheet.caption": "ni compte, ni écran, ni mot de passe à retenir",

  // ── Les parts ────────────────────────────────────────────────────────────
  "families.portions.kicker": "Les parts",
  "families.portions.title": "La part suit l’âge. Un enfant n’est jamais mis au régime.",
  "families.portions.body":
    "Un mineur n’est jamais une cible : la règle tient dans la structure, pas dans une consigne de rédaction. Le champ « objectif » existe pour tout le monde, et une génération qui viserait un mineur est refusée — pas d’écran, pas de réglage, pas de chemin pour la contourner. La part d’un enfant suit son âge, et c’est tout ce qu’elle suit.",

  "families.fig_age.label": "LA PART SUIT L’ÂGE",
  "families.fig_age.a11y_title": "Deux parts du même plat, et un objectif qui ne s’applique pas",
  "families.fig_age.a11y_desc":
    "Deux assiettes reçoivent le même plat. À côté de la première, un adulte dont l’objectif s’applique. À côté de la seconde, un mineur : aucun objectif ne le vise, et la figure ne dessine aucune différence de taille.",
  "families.fig_age.adult_label": "UN ADULTE",
  "families.fig_age.adult_value": "son objectif s’applique",
  "families.fig_age.adult_note": "la part suit ce qu’il vise",
  "families.fig_age.minor_label": "UN MINEUR",
  "families.fig_age.minor_value": "aucun objectif ne le vise",
  "families.fig_age.minor_note": "la part suit son âge, et rien d’autre",

  // ── L'envie de la semaine ────────────────────────────────────────────────
  "families.envy.kicker": "L’envie de la semaine",
  "families.envy.title":
    "Vous écrivez en une ligne ce dont la maison a envie. Le plan compose avec.",
  "families.envy.body":
    "Une ligne, écrite par la personne qui tient le foyer, lue par le générateur au moment où la semaine se compose. Ce n’est pas un vote et ce n’est pas un formulaire : c’est une phrase, et elle vaut pour toute la maison. C’est là que se règle « ma famille ne mangera pas ça », et pas dans un filtre de plus.",

  "families.fig_envy.label": "UNE LIGNE, PUIS LA SEMAINE",
  "families.fig_envy.a11y_title": "Une ligne d’envie, et la semaine qui se compose avec",
  "families.fig_envy.a11y_desc":
    "Un champ d’une seule ligne, écrit par la personne qui tient le foyer. Le trait se répartit vers les sept jours de la semaine : le générateur lit cette ligne au moment de composer.",
  "families.fig_envy.field_label": "ÉCRITE PAR VOUS, EN UNE LIGNE",
  "families.fig_envy.line": "« Cette semaine, on a envie de plats qui se partagent. »",
  "families.fig_envy.caption": "le générateur compose la semaine avec cette ligne",

  // ── Le prix ──────────────────────────────────────────────────────────────
  "families.price.kicker": "Le prix",
  "families.price.title": "12,99 € le foyer. Pas par bouche.",
  "families.price.amount": "12,99 €",
  "families.price.period": "par mois, le foyer entier",
  "families.price.label": "Jusqu’à huit bouches. La vôtre n’est jamais comptée.",
  "families.price.body":
    "Ajouter une bouche ne change pas le prix, et le foyer est plafonné à huit. Un adulte qui veut son propre accès prend un profil réclamé, à 2 € par mois : c’est le seul supplément qui existe. Le produit ne vous fait pas payer d’être une famille.",

  "families.fig_price.label": "LE PRIX SUIT LE FOYER",
  "families.fig_price.a11y_title": "Huit places, un seul prix",
  "families.fig_price.a11y_desc":
    "Huit emplacements de bouche alignés. Le premier est le vôtre et n’est jamais compté. Le prix inscrit dessous ne change pas quand les emplacements se remplissent.",
  "families.fig_price.you": "VOUS",
  "families.fig_price.not_counted": "JAMAIS COMPTÉ",
  "families.fig_price.cap": "PLAFOND : 8 BOUCHES",
  "families.fig_price.amount": "12,99 €",
  "families.fig_price.note": "à une bouche comme à huit",

  // ── Ce qu'on ne promet pas ───────────────────────────────────────────────
  "families.limits.kicker": "Ce qu’on ne promet pas",
  "families.limits.title": "Ce que Sophia ne fait pas pour votre foyer.",
  "families.limits.i1":
    "La garde des allergies porte sur ce qui se fabrique : la semaine, le repas. Une réponse écrite dans le chat, elle, ne relit pas l’union des contraintes du foyer — c’est pour ça que le mot « partout » n’est écrit nulle part sur cette page.",
  "families.limits.i2":
    "Aucune courbe de poids pour une bouche du foyer : ce qui s’écrit s’écrase, sans date et sans série. Il n’y a rien à suivre.",
  "families.limits.i3":
    "Les chiffres restent éteints par défaut, et il faut passer plusieurs verrous pour les allumer. Rien ne s’affiche en chiffres tant que vous ne l’avez pas demandé.",
  "families.limits.i4":
    "Il n’y a pas de conseil de famille : personne ne vote, et le plan ne vous rend pas compte de ce qu’il a fait de votre ligne.",
  "families.limits.i5": "Pas d’application mobile : Sophia s’ouvre dans un navigateur.",
  "families.limits.i6":
    "Sophia ne remplace ni la lecture d’une étiquette, ni l’avis d’un médecin. Elle compose des repas ; elle ne soigne personne et ne diagnostique rien.",

  // ── La sortie ────────────────────────────────────────────────────────────
  "families.closing.kicker": "Commencer",
  "families.closing.title": "Créez votre foyer, une bouche à la fois.",
  "families.closing.body":
    "Pour chaque bouche, on demande quatre choses : prénom, date de naissance, objectif, allergies. Vous les écrivez une fois ; elles gouvernent la casserole ensuite.",

  // ── COACHES ───────────────────────────────────────────────────────────
  "coaches.seo_title": "Sophia — ta méthode répond à tes élèves, tous les jours",
  "coaches.seo_description":
    "Sophia apprend ta façon de coacher — tes convictions, tes lignes rouges, ce que tu dis à la place — et répond à tes élèves avec ta méthode, tous les jours. Ce qu’elle écrit dans le chat est relu contre tes lignes rouges avant d’être envoyé, par du code. Le lundi, tu lis une page. 7 € par élève et par mois, sans forfait de plateforme.",

  // ── Hero ────────────────────────────────────────────────────────────────
  "coaches.hero.kicker": "Pour les coachs qui vendent une méthode, pas des heures",
  "coaches.hero.title": "Ta formation se termine. Ton coaching, non.",
  "coaches.hero.lede":
    "Tu as écrit ta méthode une fois. Sophia répond à tes élèves avec elle, tous les jours — la question de 21 h, la semaine qu’ils composent, les repas qu’elle leur propose. Ce que tu ne pouvais vendre qu’une fois devient ce qu’on paie chaque mois.",
  "coaches.hero.cta": "Démarrer l’essai de 14 jours",
  "coaches.hero.note":
    "14 jours, jusqu’à 3 élèves, puis ça s’arrête tout seul. Ils entrent sur invitation par e-mail et reçoivent un espace à eux, chat compris. Rien ne revient dans une boîte de réception chez toi — il n’y en a pas.",
  "coaches.hero.fig_caption":
    "Tu l’enregistres une fois, dans un entretien guidé : tes convictions, tes lignes rouges, ce que tu dis à la place, ton vocabulaire. Tu la révises quand tu veux — une correction s’applique dès le message suivant — et tu reviens à une version précédente sans perdre l’historique de ce que tes élèves ont reçu.",

  "coaches.fig.method.title": "Une méthode, quatre endroits où elle est écrite",
  "coaches.fig.method.desc":
    "La méthode publiée à gauche. À droite, les quatre choses que Sophia compose pour un élève : son chat, la semaine qu’il compose, les repas qu’elle lui propose, les repas de son foyer. Chacune est composée avec la méthode dedans.",
  "coaches.fig.method.eq": "ENREGISTRÉE UNE FOIS",
  "coaches.fig.method.source": "TA MÉTHODE",
  "coaches.fig.method.l1": "tes convictions",
  "coaches.fig.method.l2": "tes lignes rouges",
  "coaches.fig.method.l3": "ce que tu dis à la place",
  "coaches.fig.method.l4": "ton vocabulaire",
  "coaches.fig.method.out1": "son chat",
  "coaches.fig.method.out2": "sa semaine composée",
  "coaches.fig.method.out3": "les repas proposés",
  "coaches.fig.method.out4": "les repas du foyer",

  // ── La journée ──────────────────────────────────────────────────────────
  "coaches.day.kicker": "Chaque jour",
  "coaches.day.title": "Les questions qui arrivent une fois la formation finie.",
  "coaches.day.body":
    "Les modules sont enregistrés, la cohorte est pleine, la méthode est bonne. Et puis c’est mardi soir, et un élève a une question qui n’est dans aucun module — parce qu’elle porte sur sa soirée, sa cuisine, sa semaine à lui. Multiplie par tous les inscrits.",
  "coaches.day.q1": "« Je peux remplacer le riz par des pâtes ce soir ? »",
  "coaches.day.q2": "« Je meurs de faim à 16 h — c’est normal ? »",
  "coaches.day.q3": "« J’ai mal mangé à un mariage. J’ai foutu la semaine en l’air ? »",
  "coaches.day.close":
    "Chacune a une réponse, et cette réponse est la tienne — tu l’as tranchée cent fois. Personne ne part parce que la méthode était mauvaise. Ils s’éloignent parce que mardi soir, personne qui pense comme toi n’était là.",
  "coaches.day.fig_caption":
    "L’échange est un exemple. La question du soir et ses trois boutons sont les mots du produit, mot pour mot : un tap par jour, et si la journée a été dure — ou seulement mitigée — une relance demande l’énergie, la faim ou le sommeil.",

  "coaches.fig.chat.title": "Une journée dans le chat d’un élève",
  "coaches.fig.chat.desc":
    "L’élève écrit ce qui s’est passé à midi et reçoit une réponse composée avec la méthode de son coach. Le soir, une question et trois boutons : All good, So-so, Rough.",
  "coaches.fig.chat.heading": "Dans son chat, aujourd’hui",
  "coaches.fig.chat.them": "L’ÉLÈVE",
  "coaches.fig.chat.sophia": "SOPHIA",
  "coaches.fig.chat.student": "Mangé dehors ce midi. Aucune idée du contenu.",
  "coaches.fig.chat.reply1": "Alors ce soir, simple : une protéine, des légumes,",
  "coaches.fig.chat.reply2": "une portion normale. Un repas ne fait pas la semaine.",
  "coaches.fig.chat.evening": "LE SOIR",
  // MOT POUR MOT, en anglais dans les deux locales — voir l'en-tête, écart n°2.
  "coaches.fig.chat.question": "How was today?",
  "coaches.fig.chat.tap_good": "All good",
  "coaches.fig.chat.tap_mixed": "So-so",
  "coaches.fig.chat.tap_rough": "Rough",

  // ── Le bloc sombre ──────────────────────────────────────────────────────
  "coaches.lock.kicker": "La partie qui devrait te faire le plus peur",
  "coaches.lock.title": "Une IA qui parle en ton nom est un risque. On le traite comme tel.",
  "coaches.lock.body":
    "Un prompt est une consigne, pas une garantie. Dis à n’importe quel modèle « ne recommande jamais de grignoter entre les repas » et il obéira presque toujours — et presque toujours est le mauvais chiffre quand une seule contradiction publique est ce que tes élèves retiendront.",
  "coaches.lock.scope":
    "Alors ta méthode est écrite dans tout ce que Sophia compose pour tes élèves : le chat, chaque semaine, chaque repas. Ça, c’est une consigne. La suite n’en est pas une : ce qu’elle écrit dans le chat est relu contre tes lignes rouges avant d’être envoyé, par du code, sans modèle dans cette boucle.",
  "coaches.lock.instead":
    "Et ce qui part à la place ne vient pas de nous non plus. Chaque ligne rouge porte ce que tu dis à la place, dans tes mots, et c’est signé de ton nom — ton élève lit ta position, et sait qu’elle est de toi.",
  "coaches.lock.close":
    "Il ne reçoit jamais un refus, et jamais un « demande à ton coach » — dans une masterclasse, ça désigne une porte qui n’existe pas. Il reçoit ta réponse.",

  "coaches.fig.lock.title": "Un message retenu, et ce qui part à sa place",
  "coaches.fig.lock.desc":
    "La question d’un élève, le brouillon qui franchissait une ligne rouge, la relecture qui le retient, et la phrase que le coach a écrite pour ce cas exact, qui part à sa place, signée de son nom.",
  "coaches.fig.lock.eq": "DANS LE CHAT, AVANT L’ENVOI",
  "coaches.fig.lock.ask_label": "UN ÉLÈVE DEMANDE",
  "coaches.fig.lock.ask": "« Je rajoute une collation entre midi et le soir ? »",
  "coaches.fig.lock.draft_label": "LE BROUILLON DISAIT",
  "coaches.fig.lock.draft": "« Une petite collation l’après-midi peut aider. »",
  "coaches.fig.lock.held": "retenu",
  "coaches.fig.lock.gate": "TA LIGNE ROUGE — pas de grignotage entre les repas",
  "coaches.fig.lock.gate_note": "aucun modèle dans cette boucle",
  "coaches.fig.lock.sent_label": "CE QUI EST PARTI",
  "coaches.fig.lock.sent1": "« Trois vrais repas. Si tu as faim entre les deux,",
  "coaches.fig.lock.sent2": "c’est que le repas d’avant était trop petit. »",
  "coaches.fig.lock.sign": "— Marc",

  // ── Le lundi ────────────────────────────────────────────────────────────
  "coaches.monday.kicker": "Chaque lundi",
  "coaches.monday.title": "Une page, et aucun modèle ne l’a écrite.",
  "coaches.monday.body":
    "Qui parle encore, comment la semaine a été vécue, ce que tes élèves se sont fixé. Rendu par un gabarit à partir de ce qui s’est réellement passé — et quand il n’y a pas de quoi dire quelque chose, c’est ça qui est écrit, plutôt qu’un arrondi.",
  "coaches.monday.thresholds":
    "En contact veut dire qu’ils ont écrit dans les deux jours. Décrochage, c’est deux à cinq jours. Silencieux, cinq et plus. Et là où il n’y a pas de chiffre, la page écrit « no number to show » au lieu de combler le trou.",
  "coaches.monday.fig_caption":
    "Un schéma de la page du lundi. Les phrases sont celles que le moteur écrit, mot pour mot ; la cohorte est un exemple.",

  // Mot pour mot, en anglais dans les deux locales — voir l'en-tête, écart n°2.
  "coaches.fig.monday.title": "Le lundi, en une page",
  "coaches.fig.monday.desc":
    "La page hebdomadaire du coach : la semaine en prose d’abord, puis les élèves à qui écrire avec la raison attachée, puis les chiffres, en dernier et en petit.",
  "coaches.fig.monday.app_title": "This week",
  "coaches.fig.monday.week_label": "WEEK OF 2026-08-03",
  "coaches.fig.monday.week_to": "2026-08-09",
  "coaches.fig.monday.line1": "34 students this week: 25 in touch, 6 slipping, 3 silent.",
  "coaches.fig.monday.line2":
    "How the week felt: 21 holding up, 9 strained, 4 having a hard time.",
  "coaches.fig.monday.line3": "21 of 34 built themselves a week from your method.",
  "coaches.fig.monday.flagged_label": "WORTH A MESSAGE",
  "coaches.fig.monday.s1_name": "Chen Wei",
  "coaches.fig.monday.s1_reason": "Going quiet",
  "coaches.fig.monday.s1_state": "slipping",
  "coaches.fig.monday.s2_name": "Amina Diop",
  "coaches.fig.monday.s2_reason": "Has not written in days",
  "coaches.fig.monday.s2_state": "silent",
  "coaches.fig.monday.s3_name": "Luca Ferrari",
  "coaches.fig.monday.s3_reason": "Barely logged anything",
  "coaches.fig.monday.s3_none": "no number to show",
  "coaches.fig.monday.numbers_label": "THE NUMBERS",
  "coaches.fig.monday.n1_label": "responsive",
  "coaches.fig.monday.n2_label": "slipping",
  "coaches.fig.monday.n3_label": "silent",

  // ── La note 1:1 ─────────────────────────────────────────────────────────
  "coaches.note.kicker": "Si tu coaches dix personnes que tu connais vraiment",
  "coaches.note.title": "Ta méthode, c’est ce que tu dirais à n’importe lequel. Ceci est le reste.",
  "coaches.note.body":
    "Un champ, un élève, 1 500 caractères, dans tes mots : que celui-là travaille de nuit, que celle-là raye le dimanche de sa semaine. Ça atteint son chat, la semaine qu’il compose et les repas que Sophia lui propose — ta méthode, lue à travers ce que tu sais de lui. Et ça ne passe jamais devant quoi que ce soit : ses allergies d’abord, ta méthode ensuite, la note en dernier.",
  "coaches.note.limit":
    "Sophia a pour consigne de ne jamais la citer. Celle-là est une consigne, pas une vérification, et on préfère te dire laquelle est laquelle. C’est aussi une note sur une personne, donc elle lui appartient aussi : elle est incluse s’il demande un jour ses données.",
  "coaches.note.mock_label": "SUR SA PAGE, DANS TON ESPACE",
  "coaches.note.mock_heading": "Ce que tu as remarqué chez lui",
  "coaches.note.mock_body": "Travaille de nuit, mange vers 3 h du matin. Déteste cuisiner le dimanche.",
  "coaches.note.mock_caption":
    "Laisse-la vide et rien n’atteint le modèle pour dire que tu l’as laissée vide. Deux cents élèves, n’en écris aucune. Dix, écris-en dix.",

  // ── Le prix ─────────────────────────────────────────────────────────────
  "coaches.pricing.kicker": "Le prix",
  "coaches.pricing.title": "Une seule ligne. Elle grandit avec ce que tu vends.",
  "coaches.pricing.seat": "7 €",
  "coaches.pricing.seat_period": "par élève et par mois",
  "coaches.pricing.seat_label":
    "Pas de forfait de plateforme. Pas de frais d’installation. Pas de palier à dépasser.",
  "coaches.pricing.body":
    "Tu paies les élèves que tu as inscrits, et tu arrêtes de payer le mois où tu éteins un siège. Ce que tu leur factures est à toi, encaissé avec tes propres outils — nous ne facturons jamais ton élève. L’essai dure 14 jours avec 3 élèves au maximum ; pour t’abonner ensuite, il te faut au moins un élève rattaché, parce que c’est le siège qu’on facture.",
  "coaches.pricing.no_number":
    "Ce que vaut un élève qui reste au lieu de s’éloigner, c’est ton chiffre, pas le nôtre. Nous n’avons pas de chiffre de rétention à te vendre, et nous n’allons pas en inventer un.",
  "coaches.pricing.cta": "Démarrer l’essai de 14 jours",
  "coaches.pricing.trial_note": "14 jours, jusqu’à 3 élèves, puis ça s’arrête tout seul.",

  // ── La sortie ───────────────────────────────────────────────────────────
  "coaches.closing.title":
    "Tu as déjà écrit la méthode. Voici ce qui la rend payable chaque mois.",
  "coaches.closing.cta": "Démarrer l’essai de 14 jours",

  // ── GYMS ──────────────────────────────────────────────────────────────
  "gyms.seo_title": "Sophia pour les salles — un palier nutrition que vos membres paient",
  "gyms.seo_description":
    "La deuxième ligne de revenu d’une salle indépendante : un palier nutrition au-dessus de l’abonnement, tenu chaque jour par un agent qui travaille depuis votre méthode. Vous payez 7 € par membre rattaché et vous fixez ce qu’ils paient par-dessus. Ce que Sophia écrit dans le chat est relu contre vos lignes rouges avant d’être envoyé, sans modèle dans cette boucle. Le lundi, une page calculée nomme les membres qui valent un message pendant qu’on peut encore les joindre.",

  // ── HERO ────────────────────────────────────────────────────────────────
  "gyms.hero.eyebrow": "Pour les salles indépendantes — box, salles de force, studios hybrides",
  "gyms.hero.title": "Vous coachez trois heures par semaine. Ils font vingt et un repas sans vous.",
  "gyms.hero.lede":
    "C’est de là que vient le palier, et un membre qui ne voit plus son corps changer ne vient pas vous en parler : il vient moins, puis il vient le samedi, puis il ne vient plus. Sophia est un palier nutrition au-dessus de votre abonnement. Vous enregistrez une fois comment vous nourrissez des athlètes, et un agent répond à chaque membre que vous rattachez, tous les jours, depuis votre méthode.",
  "gyms.hero.cta": "Commencer l’essai de 14 jours",
  "gyms.hero.trial_note": "14 jours, 3 membres au plus, puis ça s’arrête tout seul.",
  "gyms.hero.note":
    "Vos membres entrent une adresse e-mail à la fois, sur invitation. Il n’y a pas de lien à faire circuler, et c’est voulu. Ça tourne à côté de ce que vous employez déjà pour gérer la salle : il n’y a rien à connecter.",

  // Figure 1 — la semaine d'un membre.
  "gyms.fig.week_t": "La semaine d’un membre : trois séances coachées, vingt et un repas ailleurs",
  "gyms.fig.week_d":
    "Une semaine dessinée en marques. Sur la première ligne, les trois séances coachées dans la salle. Sur la seconde, les vingt et un repas qui se passent là où la salle n’est pas — la part dont cette page parle.",
  "gyms.fig.week_label": "LA SEMAINE D’UN MEMBRE",
  "gyms.fig.week_row1": "TROIS HEURES DANS LA SALLE",
  "gyms.fig.week_row2": "VINGT ET UN REPAS, PARTOUT AILLEURS",

  // ── L'ARITHMÉTIQUE ──────────────────────────────────────────────────────
  "gyms.money.eyebrow": "L’arithmétique",
  "gyms.money.title": "Un palier que vos membres paient, en plus de l’abonnement.",
  "gyms.money.body":
    "Vous payez 7 € par membre rattaché et vous fixez ce qu’ils vous paient. Aucun forfait plateforme, aucun frais d’installation, et vous cessez de payer le mois où vous éteignez un siège. Personne chez vous n’écrit de menu, donc le palier ne vous coûte pas une heure — et c’est précisément pour ça que ce qu’il faut mettre en face n’est pas le temps qu’il fait gagner.",
  "gyms.money.close":
    "Ce que vous achetez, ce sont des mois d’abonnement. Combien vaut, pour vous, un membre qui reste trois mois de plus ? C’est le chiffre à mettre en face de 7 €, et il est à vous, pas à nous : nous n’avons pas de chiffre de rétention à vous vendre, et nous n’allons pas en inventer un.",
  "gyms.money.caption":
    "Un exemple, et il le dit. Nous ne connaissons ni votre taux de prise ni le prix que vous fixeriez, et ce sont les deux chiffres qui décident du total. Le seul qui ne soit pas une estimation est le nôtre : 7 € par membre rattaché.",

  // Figure 2 — l'exemple chiffré. Les nombres ne bougent pas ; seule la mise en
  // forme suit le français (espace insécable, « 8 000 » et non « 8,000 »).
  "gyms.fig.money_t": "Un exemple chiffré pour une salle de 250 membres",
  "gyms.fig.money_d":
    "Quatre lignes d’arithmétique. Trente-sept membres sur le palier à 25 € chacun font 925 € encaissés ; sept euros chacun pour Sophia font 259 € payés ; 666 € restent à la salle chaque mois.",
  "gyms.fig.money_label": "UN EXEMPLE — UNE SALLE DE 250 MEMBRES",
  "gyms.fig.money_uptake_label": "Sur le palier nutrition",
  "gyms.fig.money_uptake_value": "37 membres",
  "gyms.fig.money_uptake_hint": "15 % de prise, arrondi à l’entier inférieur",
  "gyms.fig.money_in_label": "Ils vous paient 25 € chacun",
  "gyms.fig.money_in_value": "925 €",
  "gyms.fig.money_out_label": "Vous payez 7 € chacun à Sophia",
  "gyms.fig.money_out_value": "− 259 €",
  "gyms.fig.money_keep_label": "Il vous reste, chaque mois",
  "gyms.fig.money_keep_value": "666 €",
  "gyms.fig.money_keep_hint": "environ 8 000 € par an",

  // ── TOUS LES JOURS ──────────────────────────────────────────────────────
  // ⚠️ « dès que la réponse n’est pas All good » est écrit à ce mot près (B23) :
  // la relance d'axe part sur tout niveau différent de « good », donc aussi sur
  // « So-so ». Ne pas ramener ça à « si c’était dur ».
  "gyms.daily.eyebrow": "Tous les jours",
  "gyms.daily.title": "Il est réveillé à 21 h un mardi soir. Vous êtes chez vous.",
  "gyms.daily.body":
    "Un membre envoie la photo d’une assiette ou une phrase sur sa journée, et reçoit une réponse construite depuis votre méthode, dans un fil qui reste ouvert. Le soir, un tap dit comment la journée s’est passée — trois boutons, et dès que la réponse n’est pas « All good », une relance demande si c’était l’énergie, la faim ou le sommeil. C’est toute la soirée.",
  // ⚠️ La dernière phrase existe pour empêcher « rien n’arrive la nuit » de
  // repousser (S5) : les heures calmes ne couvrent que la relance.
  "gyms.daily.quiet_title": "Trois jours de silence, un message.",
  "gyms.daily.quiet_body":
    "Puis ça se tait : un seul message par épisode, et une semaine avant qu’un autre soit seulement possible. Une relance au deuxième jour n’apprendrait qu’une chose, que le silence fait sonner, et elle brûlerait le signal du neuvième. Cette relance-là s’abstient entre 21 h et 8 h. Le tap du soir, lui, a sa propre fenêtre, et il peut tomber à 21 h 50.",
  "gyms.daily.fig_caption":
    "Chaque mot de ce fil est celui du produit : la question, les trois boutons, la relance, et ce que dit le champ de saisie quand il est vide.",

  // Figure 3 — le fil du soir. ⚠️ IDENTIQUE À L'ANGLAIS, ET C'EST VOULU :
  // c'est une maquette, l'app authentifiée est en anglais, et une capture
  // traduite montrerait un écran qui n'existe pas (S10).
  "gyms.fig.thread_t": "Le fil du soir, tel que le produit le rend",
  "gyms.fig.thread_d":
    "Une surface de chat. Sophia demande comment la journée s’est passée et propose trois boutons ; une seconde question demande quel axe a été dur et en propose trois autres. En bas, le champ où le membre écrit. Les libellés sont ceux du produit, en anglais.",
  "gyms.fig.thread_app": "Sophia",
  "gyms.fig.thread_sub": "Your day-to-day, with your coach's method behind it.",
  "gyms.fig.thread_q1": "How was today?",
  "gyms.fig.thread_b1": "All good",
  "gyms.fig.thread_b2": "So-so",
  "gyms.fig.thread_b3": "Rough",
  "gyms.fig.thread_q2": "What was hard?",
  "gyms.fig.thread_a1": "Energy",
  "gyms.fig.thread_a2": "Hunger",
  "gyms.fig.thread_a3": "Sleep",
  "gyms.fig.thread_composer": "Write to Sophia",
  "gyms.fig.thread_send": "Send",

  // ── LE LUNDI ────────────────────────────────────────────────────────────
  "gyms.monday.eyebrow": "Chaque lundi",
  "gyms.monday.title": "Les noms qui valent un message, pendant qu’on peut encore les joindre.",
  "gyms.monday.body":
    "Une page, calculée sur ce qui s’est passé et rendue par un gabarit. Aucun modèle ne la rédige, et c’est pour ça qu’elle ne peut pas vous flatter. Un membre qui a écrit dans les deux derniers jours est joignable ; entre deux et cinq jours, il décroche ; au-delà de cinq, il est silencieux.",
  "gyms.monday.close":
    "Celui qui décroche est le seul utile. Il est encore joignable, et un message de vous arrive encore. Votre logiciel de badges vous dira la même chose dans six semaines, et le mot pour le dire sera « ancien membre ».",
  "gyms.monday.scope": "Vous voyez les membres que vous avez rattachés, et personne d’autre.",
  "gyms.monday.fig_caption":
    "Un schéma de cette page. Les noms sont inventés ; les libellés, les motifs et les états sont les mots du produit, en anglais.",

  // Figure 4 — le lundi. ⚠️ IDENTIQUE À L'ANGLAIS, même raison que la figure 3.
  "gyms.fig.monday_t": "La page du lundi : les membres qui valent un message",
  "gyms.fig.monday_d":
    "La page hebdomadaire du propriétaire. Trois membres qui valent un message, chacun avec le motif observé et son état de contact — et, sur le troisième, la mention qu’il n’y a aucun chiffre à montrer.",
  "gyms.fig.monday_app": "This week",
  "gyms.fig.monday_worth": "WORTH A MESSAGE",
  "gyms.fig.monday_n1": "Chen Wei",
  "gyms.fig.monday_r1": "Going quiet",
  "gyms.fig.monday_s1": "slipping",
  "gyms.fig.monday_n2": "Amina Diop",
  "gyms.fig.monday_r2": "Has not written in days",
  "gyms.fig.monday_s2": "silent",
  "gyms.fig.monday_n3": "Luca Ferrari",
  "gyms.fig.monday_r3": "Barely logged anything",
  "gyms.fig.monday_s3": "no number to show",

  // ── UNE FOIS ────────────────────────────────────────────────────────────
  "gyms.fit.eyebrow": "Une fois",
  "gyms.fit.title": "Ça ne marche que si la méthode est la vôtre.",
  "gyms.fit.body":
    "Un entretien guidé transforme ce que vous dites déjà sur le plateau en quelque chose qu’un agent peut tenir : ce dont vous êtes convaincu, ce que vous excluez, ce que vous tranchez sur les cas difficiles, vos mots. Vous relisez exactement ce qu’il a compris avant de publier. Vous révisez quand vous voulez, et vous revenez à une version antérieure sans perdre l’historique de ce que vos membres ont réellement reçu.",
  // B20 : la limite est dite. Une salle à trois coachs = un compte coach.
  "gyms.fit.one_title": "Un compte, une méthode.",
  "gyms.fit.one_body":
    "Une salle à trois coachs enregistre une méthode, pas trois. Il n’y a pas d’entité salle au-dessus du compte, ni de liste de coachs dedans : celui qui s’assied à l’entretien est celui depuis qui l’agent travaille, et ce doit être celui à qui ça profite.",
  "gyms.fit.no_title": "Pas le diététicien qu’on désigne.",
  "gyms.fit.no_body":
    "Confiez l’entretien à un salarié et vous récupérerez ce que vous y avez mis : une doctrine remplie sous contrainte, et un agent qui parle comme toutes les autres applis de nutrition. Un agent générique est le mode d’échec de ce produit, pas une version plus petite.",

  // ── LE DOUBLE VERROU ────────────────────────────────────────────────────
  // ⚠️ Formulation B8b. La méthode ENTRE dans le chat, dans chaque semaine et
  // chaque repas ; ce qui est écrit DANS LE CHAT est relu. Pas « chaque message
  // sortant » : quatre surfaces ne sont pas scannées.
  "gyms.lock.eyebrow": "Ce dont il faut avoir le plus peur",
  "gyms.lock.title": "Un agent qui répond à votre place est un risque. On le traite comme tel.",
  "gyms.lock.body":
    "Un prompt est une consigne, pas une garantie. Dites à n’importe quel modèle de ne jamais recommander de grignoter entre les repas et il obéira presque toujours — et presque toujours est le mauvais chiffre quand une seule contradiction publique, devant quelqu’un qui s’entraîne sous votre nom, est ce que la salle retiendra.",
  "gyms.lock.l1_tag": "Votre méthode entre",
  "gyms.lock.l1": "Elle entre dans le chat, et dans chaque semaine et chaque repas que Sophia rédige.",
  "gyms.lock.l2_tag": "Ce qui sort du chat est relu",
  "gyms.lock.l2":
    "Ce que Sophia écrit dans le chat est vérifié contre vos lignes rouges avant d’être envoyé. Déterministe, sans modèle dans cette boucle. C’est celui-là, la garantie.",
  "gyms.lock.instead":
    "Votre membre ne reçoit jamais un refus. Chaque ligne rouge porte ce que vous faites à la place, dans vos mots et signé de votre nom, et c’est ça qui arrive.",
  "gyms.lock.trace_example": "Exemple — une salle dont la méthode exclut le grignotage entre les repas.",
  "gyms.lock.traceable":
    "Et quand un membre compose une semaine à partir de votre méthode, la base refuse une ligne qui ne cite aucune de vos convictions. Une contrainte, pas une convention.",
  "gyms.lock.close":
    "Votre membre a votre réponse à 21 h un mardi soir, sur une question que vous avez tranchée cent fois sur le plateau.",

  // Figure 5 — la trace. Elle, SE TRADUIT : c'est un schéma, pas une capture,
  // et ses trois phrases sont un exemple, pas un champ du produit.
  "gyms.fig.trace_t": "Un message, de la question à ce qui est parti",
  "gyms.fig.trace_d":
    "Trois étapes. La question d’un membre, le brouillon qui franchissait une ligne rouge et a été retenu, et la ligne qui est partie à la place — celle qu’a écrite le propriétaire.",
  "gyms.fig.trace_label": "UN MESSAGE, DE BOUT EN BOUT",
  "gyms.fig.trace_s1": "UN MEMBRE DEMANDE",
  "gyms.fig.trace_t1": "« Je peux ajouter une collation entre midi et le dîner ? »",
  "gyms.fig.trace_s2": "LE BROUILLON DISAIT",
  "gyms.fig.trace_t2": "« Une petite collation l’après-midi peut aider. »",
  "gyms.fig.trace_held": "retenu",
  "gyms.fig.trace_s3": "CE QUI EST PARTI À LA PLACE",
  "gyms.fig.trace_t3": "« Trois vrais repas. Si tu as faim, le précédent était trop petit. »",

  // ── LE PRIX ─────────────────────────────────────────────────────────────
  // ⚠️ `annual` est la CORRECTION du claim faux B2 : l'intervalle annuel est
  // celui du coach, jamais du membre. « pour un siège payé à l’année ».
  "gyms.price.eyebrow": "Le prix",
  "gyms.price.title": "7 € par membre. C’est vous qui fixez ce qu’il paie.",
  "gyms.price.seat": "7 €",
  "gyms.price.seat_period": "par membre rattaché et par mois",
  "gyms.price.seat_label": "Aucun forfait plateforme. Aucune installation. Rien d’autre.",
  "gyms.price.annual": "6 € pour un siège payé à l’année.",
  "gyms.price.why":
    "Vous payez les sièges que vous avez ouverts, et vous cessez de payer le mois où vous en éteignez un. S’abonner demande au moins un membre rattaché : le premier siège vient donc avant la première facture. Après ça, l’arithmétique est la même à un membre et à cinq cents.",
  "gyms.price.billing_note":
    "Vous facturez vos membres vous-même, sur ce que vous employez déjà pour l’abonnement. Sophia ne touche jamais à leur paiement et ne le voit jamais.",
  "gyms.price.cta": "Commencer l’essai de 14 jours",
  "gyms.price.trial_note": "14 jours, 3 membres au plus, puis ça s’arrête tout seul.",

  // ── LA CLÔTURE ──────────────────────────────────────────────────────────
  "gyms.close.title": "Vous coachez déjà l’entraînement. Voici les vingt et un autres repas.",
  "gyms.close.cta": "Commencer l’essai de 14 jours",
  "gyms.close.trial_note": "14 jours, 3 membres au plus, puis ça s’arrête tout seul.",

  // ── COMMUNITIES ───────────────────────────────────────────────────────
  "communities.seo_title":
    "Sophia pour les communautés payantes — la réponse qu’un fil ne donne pas",
  "communities.seo_description":
    "Vous tenez une communauté payante. C’est un fil : vous répondez en public, au groupe, et aucun membre n’a jamais de réponse à lui. Sophia est la couche du dessous — chaque membre du palier coaché a son espace, sa semaine et ses réponses, composés à partir de votre méthode. Votre communauté ne bouge pas. 7 € par membre sur ce palier, par mois.",

  // ── HERO ─────────────────────────────────────────────────────────────────
  "communities.hero.kicker": "Pour ceux qui tiennent une communauté payante",
  "communities.hero.title": "Une communauté est un fil. Un fil ne répond pas à une personne.",
  "communities.hero.lede":
    "Vous répondez en public, au groupe — et aucune heure de plus n’y changera rien, parce que c’est la forme même de ce que vous avez construit. Vos membres le vivent comme ceci : ils n’ont jamais de réponse à eux. Sophia est la couche du dessous : chaque membre du palier coaché a son espace, sa semaine et ses réponses, composés à partir de votre méthode. Votre communauté ne bouge pas.",
  "communities.hero.cta": "Commencer l’essai de 14 jours",
  "communities.hero.note":
    "14 jours, 3 membres au plus, puis ça s’arrête tout seul. Vos membres entrent par une invitation e-mail envoyée depuis votre espace, et rien ne vous revient sous forme de boîte de réception.",
  "communities.hero.signin_prompt": "Déjà sur Sophia ?",
  "communities.hero.signin_link": "Se connecter",

  // ── FIGURE A ─────────────────────────────────────────────────────────────
  "communities.fig_lane.label": "UNE QUESTION, DEUX DESTINATIONS",
  "communities.fig_lane.alt_title": "Une réponse pour tous, ou une réponse à chacun",
  "communities.fig_lane.alt_desc":
    "Les mêmes quatre membres, dessinés deux fois. À gauche, un seul trait les ouvre tous les quatre : c’est une réponse publique, écrite pour convenir à tout le monde. À droite, chacun a son propre trait. Ce qui change n’est pas la quantité de travail, c’est le nombre de personnes à qui la réponse s’adresse.",
  "communities.fig_lane.thread_label": "DANS LE FIL",
  "communities.fig_lane.tier_label": "SUR LE PALIER COACHÉ",
  "communities.fig_lane.thread_caption": "une réponse pour tout le monde",
  "communities.fig_lane.tier_caption": "une réponse à chacun",

  // ── LE PALIER ────────────────────────────────────────────────────────────
  "communities.tier.kicker": "Ce que vous ajoutez",
  "communities.tier.title":
    "Un palier au-dessus de ce que vous vendez déjà. Rien ne bouge en dessous.",
  "communities.tier.body":
    "Même plateforme, même prix d’entrée, mêmes publications, mêmes gens. Au-dessus, vous ouvrez une option de plus : tout ce qu’ils ont déjà, et un agent qui les coache un par un dans votre méthode. Ceux qui en veulent montent. Les autres ne s’aperçoivent jamais qu’elle existe.",

  "communities.fig_tier.label": "LA MÊME OFFRE, ET UNE BANDE DE PLUS",
  "communities.fig_tier.alt_title":
    "Le palier se pose au-dessus, l’offre du dessous ne bouge pas",
  "communities.fig_tier.alt_desc":
    "Deux fois la même offre, dessinée par un seul élément appelé deux fois. Celle du dessus porte une bande de plus : l’agent de chaque membre. Rien d’autre ne change — ni la plateforme, ni le prix d’entrée, ni les publications.",
  "communities.fig_tier.band": "son agent à lui, chaque jour",
  "communities.fig_tier.tier_label": "LE PALIER COACHÉ",
  "communities.fig_tier.tier_value": "41 €",
  "communities.fig_tier.base_label": "VOTRE COMMUNAUTÉ",
  "communities.fig_tier.base_value": "29 €",
  "communities.fig_tier.cost_label": "VOTRE COÛT",
  "communities.fig_tier.cost_value": "7 €",

  "communities.tier.example":
    "Un exemple chiffré. Cinq cents membres, trois sur dix prennent le palier : 150 × 12 €, moins 150 sièges à 7 €. Environ 750 € par mois, sur des gens dont vous avez déjà payé l’acquisition.",
  "communities.tier.example_caption":
    "C’est écrit exemple parce que c’en est un : votre prix et votre taux de passage décident du total, et ces deux-là sont à vous. Ce qui n’est pas une estimation, c’est le 7 €, et le fait qu’il ne porte que sur les membres qui montent.",
  "communities.tier.billing":
    "Vous continuez de les encaisser là où vous les encaissez déjà. Aucun membre ne paie Sophia, ni ne nous voit comme quelque chose à payer.",

  // ── LES BORNES ───────────────────────────────────────────────────────────
  "communities.tier.not_label": "Et avant que vous demandiez ce qu’il faudra refaire : rien",
  "communities.tier.not1_title": "Aucune intégration à votre plateforme",
  "communities.tier.not1_body":
    "Il n’existe aucune intégration Skool, Circle, Discord ou Kajabi — aucune, et nous préférons le dire ici plutôt que vous le laisser découvrir le premier jour. Vos membres entrent par une invitation e-mail que vous envoyez depuis votre espace. Il n’y a pas de lien à copier, et c’est une propriété de sécurité, pas un bouton qui manque.",
  "communities.tier.not2_title": "Aucune seconde couche sociale",
  "communities.tier.not2_body":
    "Vos membres ne se voient jamais entre eux dans Sophia : pas de fil, pas de salon, pas de commentaire. Sophia ne peut pas devenir l’endroit où vos gens se retrouvent, parce qu’il n’y a pas d’endroit. La couche sociale, c’est la vôtre, et elle le reste.",
  "communities.tier.not3_title": "Aucun paiement demandé à vos membres",
  "communities.tier.not3_body":
    "Vous fixez le prix de votre palier, et vous l’encaissez là où vous encaissez déjà. Il n’existe nulle part dans le produit un tunnel de paiement pour un membre.",
  "communities.tier.not4_title": "Ce n’est pas un compteur",
  "communities.tier.not4_body":
    "Les chiffres d’énergie sont éteints par défaut sur le compte d’un membre, et une chaîne de gardes décide si on peut seulement les allumer. Ce qui lui revient, c’est ce qu’il a mangé, quand, et quelle taille de part.",

  // ── LES RÔLES ────────────────────────────────────────────────────────────
  "communities.roles.kicker": "Pourquoi ils restent",
  "communities.roles.title": "Gardez les pairs. Ajoutez ce qu’un groupe n’allait jamais faire.",
  "communities.roles.body":
    "Une communauté est bonne à ce à quoi une communauté est bonne : des gens qui traversent la même chose en même temps, qui se répondent à minuit et qui remarquent quand quelqu’un disparaît une semaine. Sophia n’y touche pas, et ne pourrait pas le prendre même en essayant — elle n’a ni fil ni salon où l’emmener. Ce qu’un groupe ne sait pas faire, c’est répondre à une personne, à 21 h, sur le dîner qu’elle a devant elle.",
  "communities.roles.group_title": "Reste dans votre communauté",
  "communities.roles.group_body":
    "Les pairs. La culture que vous avez bâtie. Vos publications, vos lives, les victoires que les gens affichent le vendredi. C’est pour ça qu’ils sont venus, et aucun agent ne le fabrique.",
  "communities.roles.agent_title": "Passe dans sa ligne à lui",
  "communities.roles.agent_body":
    "La question de 21 h sur son assiette à lui. La semaine composée à partir de votre méthode, pour sa cuisine et son emploi du temps. Et au troisième jour de silence, un message écrit à partir de la méthode que vous avez publiée — celui-là ne part pas entre 21 h et 8 h, il arrive donc dans sa matinée plutôt que par-dessus sa soirée.",

  // ── FIGURE C ─────────────────────────────────────────────────────────────
  "communities.fig_third_day.label": "LE TROISIÈME JOUR DE SILENCE",
  "communities.fig_third_day.alt_title": "Le troisième jour de silence",
  "communities.fig_third_day.alt_desc":
    "Une ligne de temps. À gauche, le dernier message d’un membre. Trois jours sans rien. Au troisième jour, un message part, composé à partir de la méthode publiée du coach. Puis la ligne repart nue : il n’en part jamais qu’un.",
  "communities.fig_third_day.last_label": "SON DERNIER MESSAGE",
  "communities.fig_third_day.last_value": "puis plus rien",
  "communities.fig_third_day.message_label": "UN MESSAGE",
  "communities.fig_third_day.message_value": "dans votre méthode",
  "communities.fig_third_day.silence": "trois jours de silence",
  "communities.fig_third_day.after": "puis ça s’arrête",
  "communities.roles.figure_caption":
    "Soixante-douze heures de silence, un message, et ça s’arrête là : un par épisode, et au plus un par semaine. Le membre qui décroche a de vos nouvelles pendant qu’on peut encore l’atteindre, et pas le mois où sa carte est refusée.",
  "communities.roles.close":
    "Vous n’arbitrez pas entre nous et une autre IA. Vous arbitrez entre un salon de plus — qui reste un salon, où l’on répond en public — et un salaire de plus, qu’il faut former à votre méthode et qui ne tient pas cinq cents membres.",

  // ── LE LUNDI ─────────────────────────────────────────────────────────────
  "communities.monday.kicker": "Ce qu’un fil ne vous dit jamais",
  "communities.monday.title": "Dans un fil, vous ne voyez jamais que les dix qui postent.",
  "communities.monday.body":
    "Dix personnes qui écrivent peuvent en cacher quatre-vingt-dix qui ont arrêté sans rien dire, et rien dans un fil ne distingue le membre qui va bien en silence de celui qui est parti dans sa tête il y a six semaines. Le lundi, vous avez une page, rendue par gabarit à partir de ce qui s’est vraiment passé et jamais racontée par un modèle — et la première chose dessus, ce sont ceux qui n’ont rien dit.",

  "communities.fig_monday.alt_title": "La page du lundi",
  "communities.fig_monday.alt_desc":
    "Schéma de la page hebdomadaire : d’abord qui parle encore — en contact, décrochage, silence — puis comment la semaine a été vécue, et en dernier combien de membres se sont composé une semaine à partir de la méthode du coach. Les silencieux sont sur la première ligne, avant tout le reste.",
  "communities.fig_monday.screen_title": "Cette semaine",
  "communities.fig_monday.contact_label": "QUI PARLE ENCORE",
  "communities.fig_monday.in_touch": "En contact",
  "communities.fig_monday.in_touch_hint": "ont répondu sous 2 jours",
  "communities.fig_monday.slipping": "Décrochage",
  "communities.fig_monday.slipping_hint": "silence de 2 à 5 jours",
  "communities.fig_monday.silent": "Silencieux",
  "communities.fig_monday.silent_hint": "silence de 5 jours ou plus",
  "communities.fig_monday.felt_label": "COMMENT LA SEMAINE A ÉTÉ VÉCUE",
  "communities.fig_monday.holding": "Tiennent le rythme",
  "communities.fig_monday.strained": "Sous tension",
  "communities.fig_monday.hard": "Période difficile",
  "communities.fig_monday.unknown": "Pas assez de points pour le dire",
  "communities.fig_monday.intent_line":
    "88 membres sur 150 se sont composé une semaine avec votre méthode.",
  "communities.monday.figure_caption":
    "Un schéma de la page du lundi. Les seuils sont ceux du produit : deux jours de silence ouvrent le décrochage, cinq jours ouvrent le silence, et les deux se mesurent sur leur dernier message entrant. La cohorte est l’exemple ci-dessus — les 150 membres d’une communauté de 500 qui ont pris le palier.",
  "communities.monday.close":
    "Et quand il n’y a pas de quoi dire quelque chose, la page le dit. Un membre qui a répondu deux fois ne vous a pas donné une semaine : il revient en « pas assez de points pour le dire » plutôt qu’en « va bien ».",

  // ── LA VOIX ──────────────────────────────────────────────────────────────
  "communities.voice.kicker": "Votre voix est l’actif",
  "communities.voice.title":
    "Il répond avec vos mots. Pas avec les nôtres, et pas dans un style maison.",
  "communities.voice.body":
    "Vos membres reconnaissent votre écriture au premier coup d’œil, au milieu de n’importe quel contenu santé — et cette reconnaissance est l’essentiel de ce qu’ils paient. Sophia n’a donc pas de personnalité à elle : elle prend votre méthode. Comment vous vous adressez aux gens, la longueur que vous vous donnez, les mots que vous employez et le sens que vous leur donnez, les positions que vous tenez, et ce que vous dites à la place quand on vous demande ce que vous ne recommandez pas. Vous l’écrivez une fois, dans un entretien guidé, et vous relisez ce qu’elle en a compris avant la moindre publication.",

  "communities.fig_voice.alt_title": "Ce que Sophia retient de votre voix",
  "communities.fig_voice.alt_desc":
    "Quatre champs de la doctrine, tels qu’ils sont écrits : la façon dont vous vous adressez aux gens, un terme à vous avec le sens que vous lui donnez, une ligne rouge, et ce que vous dites à la place de cette ligne rouge. La dernière fiche est ouverte par un trait, parce que c’est elle que votre membre reçoit.",
  "communities.fig_voice.screen_title": "Votre voix",
  "communities.fig_voice.address_label": "COMMENT VOUS LEUR PARLEZ",
  "communities.fig_voice.address_value": "Prénom, tutoiement. Deux ou trois phrases. Pas d’emojis.",
  "communities.fig_voice.term_label": "UN DE VOS TERMES",
  "communities.fig_voice.term_value1": "« Jour de reset » — un jour prévu léger exprès.",
  "communities.fig_voice.term_value2": "Pas un jour où l’on a échoué.",
  "communities.fig_voice.line_label": "UNE DE VOS LIGNES ROUGES",
  "communities.fig_voice.line_value": "Ne jamais conseiller de grignoter entre les repas.",
  "communities.fig_voice.instead_label": "ET CE QUE VOUS DITES À LA PLACE",
  "communities.fig_voice.instead_value1": "Trois vrais repas. Si tu as faim entre les deux,",
  "communities.fig_voice.instead_value2": "c’est que le repas d’avant était trop petit.",
  "communities.voice.traceable":
    "Et quand un membre se compose une semaine à partir de votre méthode, chaque ligne nomme la conviction qu’elle applique. La base refuse une ligne qui n’en nomme aucune — c’est une contrainte, pas une convention.",
  "communities.voice.revise":
    "Révisez ce que vous voulez quand vous voulez, et revenez à une version antérieure sans perdre ce que vos membres ont réellement reçu.",
  "communities.voice.close":
    "Ce qui pose la seule question qui vaille, une fois qu’on a confié sa voix à un logiciel : que se passe-t-il le jour où il écrit une phrase que vous n’écririez jamais, devant les gens qui savent comment vous écrivez.",

  // ── LE DOUBLE VERROU ─────────────────────────────────────────────────────
  "communities.lock.kicker": "Ce qui devrait vous faire le plus peur",
  "communities.lock.title":
    "Une IA qui écrit dans votre méthode, à vos propres membres, est un risque. Nous le traitons comme tel.",
  "communities.lock.body":
    "Un prompt est une consigne, pas une garantie. Dites à n’importe quel modèle « ne jamais conseiller de grignoter entre les repas » et il obéira presque toujours — et presque toujours est le mauvais chiffre quand une seule contradiction publique de votre part est la capture d’écran qui finit dans votre propre communauté. Votre méthode est donc tenue deux fois, par deux mécanismes qui échouent différemment.",
  "communities.lock.lock1_tag": "Injectée",
  "communities.lock.lock1":
    "Votre méthode entre dans le chat, dans chaque semaine et dans chaque repas que Sophia rédige.",
  "communities.lock.lock2_tag": "Relue",
  "communities.lock.lock2":
    "Ce qu’elle écrit dans le chat est relu contre vos lignes rouges avant d’être envoyé. De façon déterministe, sans modèle dans cette boucle. C’est celui-là, la garantie.",

  "communities.fig_lock.label": "UN MESSAGE, RELU",
  "communities.fig_lock.alt_title": "Ce qui a été retenu, et ce qui est parti",
  "communities.fig_lock.alt_desc":
    "Trois temps, de haut en bas : la question d’un membre, le brouillon que la relecture a retenu parce qu’il contredit une ligne rouge, et le message réellement envoyé — celui que vous avez écrit à la place. Le troisième est ouvert par un trait, parce que c’est le seul que le membre reçoit.",
  "communities.fig_lock.ask_label": "UN MEMBRE DEMANDE",
  "communities.fig_lock.ask_value": "Je peux ajouter une collation entre midi et le dîner ?",
  "communities.fig_lock.draft_label": "LE BROUILLON DISAIT",
  "communities.fig_lock.draft_value": "Une petite collation l’après-midi peut aider.",
  "communities.fig_lock.held": "retenu",
  "communities.fig_lock.sent_label": "CE QUI EST PARTI",
  "communities.fig_lock.sent_value1": "Trois vrais repas. Si tu as faim entre les deux,",
  "communities.fig_lock.sent_value2": "c’est que le repas d’avant était trop petit.",
  "communities.lock.trace_note":
    "Ce remplacement n’est pas le nôtre. Chaque ligne rouge porte ce que vous faites à la place, dans vos mots, et c’est ça que votre membre reçoit.",
  "communities.lock.close":
    "Votre membre ne reçoit jamais un refus, et jamais un « demande dans le groupe » — qui le renverrait droit vers le fil que cette couche existe pour dépasser.",

  // ── LE PRIX ──────────────────────────────────────────────────────────────
  "communities.pricing.kicker": "Le prix",
  "communities.pricing.title": "Une ligne, et seulement pour les membres qui montent.",
  "communities.pricing.seat": "7 €",
  "communities.pricing.seat_period": "par membre et par mois",
  "communities.pricing.seat_label":
    "Pas de forfait de plateforme. Pas de frais de mise en route. Rien d’autre.",
  "communities.pricing.annual": "6 € pour un siège payé à l’année.",
  "communities.pricing.why":
    "Vous payez les membres que vous avez mis sur le palier coaché, et vous arrêtez de payer le mois où vous éteignez un siège. Le reste de votre communauté ne vous coûte rien, parce qu’il n’est pas là.",
  "communities.pricing.no_number":
    "Nous n’avons pas de chiffre de rétention à vous vendre, et nous n’allons pas en inventer un. Le chiffre qui décide de tout ça est le vôtre : ce que vaut, à votre prix, un membre qui reste trois mois de plus.",
  "communities.pricing.trial_note": "14 jours, 3 membres au plus, puis ça s’arrête tout seul.",

  // ── LA CLÔTURE ───────────────────────────────────────────────────────────
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
  // Restent au tutoiement, et c'est un lot à part: `/meal-prep` et `/coaches`.
  "start.seo_title": "Créer votre compte",
  "start.seo_description":
    "Ouvrez un compte Sophia pour votre foyer. Sophia compose la semaine autour " +
    "des personnes qui mangent vraiment à votre table.",
  "start.loading": "Un instant…",

  "start.title": "Créez votre compte.",
  "start.lead":
    "D’abord le compte. Ensuite, vous décrivez qui mange à votre table et ce " +
    "qu’il faut à chacun : c’est autour de ça que Sophia compose la semaine.",

  "start.price":
    "12,99 € par mois pour le foyer, plus 2 € par personne qui réclame son " +
    "propre accès. Votre place n’est jamais comptée.",
  "start.coach_line":
    "Un coach vous a invité ? Votre porte est le lien de son e-mail, pas celle-ci.",

  "start.sheet.form": "Inscription",
  "start.sheet.repair": "Rattachement",

  "start.form.name": "Votre nom",
  "start.form.email": "Adresse e-mail",
  "start.form.password": "Mot de passe",
  "start.form.password_hint": "8 caractères au minimum.",
  "start.form.country": "Où vous vivez",
  "start.form.country_hint":
    "Sert à vous donner le bon numéro d’urgence si une conversation en a besoin un jour.",
  "start.form.country_placeholder": "Choisissez un pays",
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
  "start.error.country_required": "Dites-nous où vous vivez.",
  "start.error.already_coached":
    "Votre compte suit déjà un coach. Vous n’avez pas besoin de vous inscrire ici.",
  "start.error.caller_is_coach":
    "C’est un compte coach. Votre espace est celui du coach, pas celui d’un foyer.",
  "start.error.unavailable":
    "L’inscription n’est pas disponible en ce moment. Rien n’a été créé — réessayez plus tard.",
  "start.error.generic": "Ça n’est pas passé. Rien n’a changé — réessayez.",
};
