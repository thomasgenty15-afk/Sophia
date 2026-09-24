// Pack français — le namespace `auth`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `auth.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frAuth = {
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
} satisfies TranslatedMessagesOf<"auth">;
