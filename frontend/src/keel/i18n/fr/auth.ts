// Pack français — le namespace `auth`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `auth.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frAuth = {
  // ── /auth — LA PORTE UNIQUE DU PRODUIT ───────────────────────────────────
  //
  // ⚠️ TUTOIEMENT, SUR DEMANDE, DEPUIS LE 2026-09-25 — tout le parcours dit
  // « tu »: `/`, `/start`, `/auth`, `/email-verified`, `/app/setup`, l'app et
  // l'espace coach. Le vouvoiement posé le 2026-09-01 est retiré.
  // Ce qu'il réparait reste la règle: le registre ne change pas entre deux
  // écrans d'un même parcours (le 2026-09-01, il changeait DEUX FOIS en trois
  // écrans, sur le seul chemin qui mène à un compte). Un « vous » ne survit que
  // s'il désigne PLUSIEURS personnes (`setup.situate.pair_hint`,
  // `setup.mouths.held_exit`).
  "auth.seo.title": "Connexion",
  "auth.seo.title_coach": "Compte coach",
  "auth.seo.description":
    "Connecte-toi à Sophia, ou crée le compte qui t’y fait entrer.",

  // Le fronton de la fiche — le nom du document, qui change avec son état.
  "auth.sheet.signin": "Connexion",
  "auth.sheet.coach": "Compte coach",
  "auth.sheet.reset": "Mot de passe",
  "auth.sheet.confirm": "Vérification de l’e-mail",

  "auth.signin.title": "Te revoilà.",
  "auth.signin.lede": "La même porte, quel que soit ton compte.",
  "auth.coach.signup_title": "Crée ton compte coach.",
  "auth.coach.signup_lede":
    "Tes élèves ont l’app. Tu écris la méthode avec laquelle elle répond. Aucun numéro de téléphone à donner.",
  "auth.coach.signin_title": "Retour à ton espace.",
  "auth.coach.signin_lede": "Connecte-toi à ton espace coach.",
  "auth.reset.title": "Réinitialise ton mot de passe.",
  "auth.reset.lede":
    "Indique ton adresse. Nous envoyons un lien qui ouvre la page où choisir un nouveau mot de passe.",

  "auth.field.email": "Adresse e-mail",
  "auth.field.password": "Mot de passe",
  "auth.field.password_show": "Afficher le mot de passe",
  "auth.field.password_hide": "Masquer le mot de passe",
  "auth.field.name": "Ton nom",
  "auth.field.name_hint": "Le nom sous lequel tes élèves te verront.",
  "auth.field.language":
    "La langue dans laquelle tu veux travailler",
  "auth.field.language_hint":
    "Ton espace et le coaching de tes élèves se passent dans cette langue. Tu pourras en changer plus tard.",
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

  "auth.confirm.title": "Regarde ta boîte mail.",
  "auth.confirm.body":
    "Un lien de confirmation part vers {email}. Clique dessus, puis reviens ici : cette page se met à jour toute seule.",
  "auth.confirm.spam": "Rien à cet endroit ? Regarde dans les indésirables.",
  "auth.confirm.waiting": "En attente de la vérification…",
  "auth.confirm.checking": "Vérification en cours…",
  "auth.confirm.check_cta": "J’ai cliqué sur le lien",
  "auth.confirm.resend": "Renvoyer l’e-mail de confirmation",
  "auth.confirm.resend_wait": "Renvoyer dans {seconds} s",
  "auth.confirm.change_email": "Utiliser une autre adresse",
  "auth.confirm.not_verified":
    "Pas encore vérifié. Clique sur le lien reçu par e-mail, puis reviens ici.",
  "auth.confirm.check_failed": "La vérification n’a pas pu aboutir. Réessaie.",
  "auth.confirm.verified_title": "E-mail vérifié.",
  "auth.confirm.verified_body": "Préparation de ton espace…",
  "auth.confirm.retry": "Réessayer",

  "auth.doors.divider": "Pas encore de compte ?",
  "auth.doors.household.label": "Ton compte Sophia",
  "auth.doors.household.body":
    "Ouvre ton compte et compose ta semaine autour de qui mange à ta table.",
  "auth.doors.household.cta": "Créer un compte gratuit",
  "auth.doors.household.prompt": "Tu cuisines chez toi ?",
  "auth.doors.pro.label": "Professionnel",
  "auth.doors.pro.body":
    "Écris ta méthode une fois. Tes élèves composent leur semaine dedans.",
  "auth.doors.coach_divider_signup": "Tu as déjà un compte coach ?",
  "auth.doors.coach_divider_signin": "Pas encore de compte coach ?",

  "auth.error.legal":
    "Accepte les conditions générales et la politique de confidentialité pour continuer.",
  "auth.error.student_signup_moved":
    "L’inscription élève a déménagé. Ouvre /start pour créer ton compte, ou utilise le lien que ton coach t’a envoyé.",
  "auth.error.prelaunch_signup":
    "L’inscription est fermée (pré-lancement). Connecte-toi avec le compte master_admin.",
  "auth.error.prelaunch_forbidden":
    "L’accès est restreint (pré-lancement). Seul le compte master_admin peut se connecter.",
  "auth.error.coach_profile":
    "Ton compte existe, mais le profil coach n’a pas pu être créé. Reconnecte-toi pour réessayer.",
  "auth.error.pro_closed":
    "L’espace coach est fermé pour le moment. Ton compte est intact — nous t’écrirons à sa réouverture.",
  "auth.error.server_unreachable":
    "Tu es bien connecté, mais le serveur ne répond pas pour ouvrir ton espace. Réessaie dans un instant.",
  "auth.error.generic": "Une erreur est survenue.",
  "auth.error.reset_failed": "L’e-mail n’a pas pu être envoyé.",
  "auth.error.reset_smtp":
    "L’e-mail de réinitialisation n’a pas pu être envoyé.\n\nSupabase Dashboard / Auth / SMTP : SMTP personnalisé activé mais incomplet, identifiants erronés, ou domaine d’expédition non vérifié.\nAuth / URL Configuration : la liste des URL de redirection autorisées doit contenir {origin}/reset-password.\n\nDétail : {detail}",
  "auth.reset.sent":
    "Si un compte existe pour {email}, un e-mail de réinitialisation est en route.",
  "auth.reset.sent_local":
    "Pile locale : ouvre http://127.0.0.1:54324 pour le lire.",

  "auth.prelaunch.badge": "Accès restreint (pré-lancement) · master_admin uniquement",


  // ── Passerelles d'authentification ───────────────────────────────────────
  "auth.coach_link.prompt": "Tu es coach ?",
  "auth.coach_link.cta": "Créer un compte coach",
  "auth.coach_link.back_prompt": "Tu n’es pas coach ?",
  "auth.coach_link.back_cta": "Aller à la connexion classique",

  // ── /email-verified ──────────────────────────────────────────────────────
  // TUTOIEMENT, comme tout le reste d'`auth.*` (voir l'en-tête): c'est le
  // retour du lien de confirmation d'une inscription coach, et l'écran d'où
  // l'on vient (`/auth`) tutoie. Cinq phrases qui étaient en dur, sur la page qui
  // confirme à quelqu'un que son compte existe vraiment.
  "auth.verified.title": "Adresse confirmée !",
  "auth.verified.body": "Merci d’avoir pris le temps de confirmer ton adresse.",
  "auth.verified.back_to_tab": "Tu peux revenir à l’onglet d’origine",
  "auth.verified.carry_on": "pour continuer.",
  "auth.verified.close_tab": "Tu peux fermer cet onglet.",
  "auth.verified.close_tab_maybe":
    "Si tu viens de cliquer sur le lien, tu peux fermer cet onglet.",
} satisfies TranslatedMessagesOf<"auth">;
