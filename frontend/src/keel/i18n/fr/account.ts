// Pack français — le namespace `account`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `account.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frAccount = {
  // ══ `/account` — LE COMPTE ══════════════════════════════════════════════
  // Voir le pavé de `en.ts`. « DELETE » reste en anglais dans les deux
  // langues: c'est le mot que `account-deletion-v1` compare.
  "account.close": "Fermer",
  "account.cancel": "Annuler",
  "account.save": "Enregistrer",
  "account.saving": "Enregistrement…",
  "account.sign_out": "Se déconnecter",
  "account.fallback_name": "Utilisateur",
  "account.tab.general": "Compte",
  "account.tab.subscription": "Abonnement",
  "account.tab.settings": "Réglages",
  "account.general.section": "Informations personnelles",
  "account.general.full_name": "Nom complet",
  "account.general.full_name_placeholder": "Ton nom",
  "account.general.saved": "Informations enregistrées.",
  "account.general.error.save": "Impossible d’enregistrer.",
  "account.general.email": "E-mail",
  "account.email.change": "Changer mon e-mail",
  "account.email.new_aria": "Nouvelle adresse e-mail",
  "account.email.new_placeholder": "nouvel-email@example.com",
  "account.email.confirm": "Confirmer",
  "account.email.sending": "Envoi…",
  "account.email.hint":
    "Si la confirmation par e-mail est activée, Sophia te demandera de confirmer par un lien envoyé dans ta boîte de réception.",
  "account.email.error.required": "L’e-mail est obligatoire.",
  "account.email.unchanged": "E-mail inchangé.",
  "account.email.sent": "Demande envoyée. Regarde tes e-mails pour confirmer le changement.",
  "account.email.error.failed": "Impossible de changer l’e-mail.",
  "account.password.change": "Changer mon mot de passe",
  "account.password.sending": "Envoi…",
  "account.password.sent": "Un lien pour changer ton mot de passe a été envoyé à {email}.",
  "account.password.error": "Impossible d’envoyer le lien.",
  "account.member_for": "Membre depuis {days}",
  "account.member_days_one": "{count} jour",
  "account.member_days_many": "{count} jours",
  "account.subscription.body": "Ton abonnement se gère sur sa propre page.",
  "account.subscription.cta": "Voir mon abonnement",
  "account.settings.section": "Préférences",
  "account.settings.language": "Langue",
  "account.settings.language_hint":
    "S’applique tout de suite, et recharge la page. C’est aussi la langue dans laquelle Sophia te répond.",
  "account.settings.timezone": "Fuseau horaire (IANA)",
  "account.settings.timezone_current_device": "Actuel : {tz} (appareil)",
  "account.settings.timezone_current_profile": "Actuel : {tz} (profil)",
  "account.settings.roaming": "Itinérance",
  "account.settings.roaming_hint": "Suivre automatiquement le fuseau horaire de l’appareil.",
  "account.settings.roaming_aria": "Activer l’itinérance",
  "account.settings.saved": "Préférences enregistrées.",
  "account.settings.error.save": "Impossible d’enregistrer les préférences.",
  "account.error.wrong_password": "Mot de passe incorrect.",
  "account.data.section": "Mes données",
  "account.export.title": "Exporter mes données",
  "account.export.body":
    "Télécharge une copie de tes données (profil, plans, conversations, souvenirs) au format JSON, dans une archive ZIP. Limite : 1 export par 24 h.",
  "account.export.open": "Préparer mon export",
  "account.export.password_label": "Confirme ton mot de passe pour continuer",
  "account.export.password_placeholder": "Ton mot de passe",
  "account.export.download": "Télécharger l’archive (lien valable 15 minutes)",
  "account.export.preparing": "Préparation de l’archive…",
  "account.export.generate": "Générer mon export",
  "account.export.safety":
    "Par sécurité, chaque demande d’export envoie une notification dans ta conversation et par e-mail. Le fichier contient des données personnelles sensibles : garde-le en lieu sûr.",
  "account.export.error.rate_limited":
    "Tu as déjà demandé un export récemment (limite : 1 export par 24 h). Réessaie plus tard.",
  "account.export.error.failed":
    "L’export a échoué. Réessaie dans quelques minutes, ou écris à sophia@sophia-coach.ai.",
  "account.delete.title": "Supprimer mon compte",
  "account.delete.done_title": "C’est fait",
  "account.delete.export_body":
    "Avant de partir, tu peux télécharger une copie de tes données (profil, plans, conversations, souvenirs). C’est facultatif — et possible seulement tant que ton compte existe.",
  "account.delete.export_first": "Télécharger mes données d’abord",
  "account.delete.continue": "Continuer",
  "account.delete.explain_title": "Voici ce qui va se passer :",
  "account.delete.explain_access": "Ton accès à l’app est coupé immédiatement.",
  "account.delete.explain_messages": "Sophia arrête de t’écrire tout de suite.",
  "account.delete.explain_subscription":
    "Ton abonnement est résilié immédiatement, sans nouveau prélèvement. La période déjà payée n’est pas remboursée au prorata.",
  "account.delete.explain_purge": "Toutes tes données sont définitivement supprimées dans 7 jours.",
  "account.delete.explain_irreversible": "Cette suppression est irréversible.",
  "account.delete.explain_restore":
    "Tu peux changer d’avis : reconnecte-toi avant cette date et ton compte est restauré en un clic (l’abonnement n’est pas réactivé automatiquement).",
  "account.delete.member_lead": "Ta place dans {household} est",
  "account.delete.member_kept": "gardée par défaut :",
  "account.delete.member_rest":
    "ta part et tes allergies restent dans le foyer, pour que personne n’y perde un repas. Tu peux aussi demander à la retirer, à l’écran suivant.",
  "account.delete.owner_lead": "Tu gères {household}. Il n’est",
  "account.delete.owner_kept": "pas supprimé",
  "account.delete.owner_rest":
    "— les personnes qui en font partie gardent leurs parts, leurs allergies et leurs repas. Ce que tu perds, c’est ton accès.",
  "account.delete.household_your": "ton foyer",
  "account.delete.household_a": "un foyer",
  "account.delete.household_this": "ce foyer",
  "account.delete.kept_title": "Ce qui est conservé",
  "account.delete.kept_body":
    "Les factures de tes paiements (obligation légale de conservation comptable) et une trace minimale et anonymisée de la suppression (e-mail et numéro de téléphone hachés, avec la date), comme preuve de conformité. Rien d’autre.",
  "account.delete.understand": "J’ai compris, continuer",
  "account.delete.confirm_lead": "Dernière étape. Confirme ton mot de passe, puis tape",
  "account.delete.confirm_rest": "pour supprimer ton compte.",
  "account.delete.leave_question": "Retirer aussi ma place dans {household} ?",
  "account.delete.leave_body":
    "Si tu laisses cette case vide, ta place reste : ton prénom, ta part et tes allergies restent dans le foyer, et personne n’y perd un repas. Si tu la coches, tout cela est supprimé avec ton compte, le même jour.",
  "account.delete.password": "Mot de passe",
  "account.delete.type_word": "Tape {word}",
  "account.delete.error.rate_limited": "Trop de tentatives. Réessaie dans une heure.",
  "account.delete.error.request":
    "La demande a échoué. Réessaie, ou écris à sophia@sophia-coach.ai.",
  "account.delete.error.word": "Tape exactement « {word} » pour confirmer.",
  "account.delete.error.subscription":
    "Impossible de résilier ton abonnement pour l’instant. Rien n’a été supprimé — réessaie dans quelques minutes.",
  "account.delete.error.failed": "La suppression a échoué. Rien n’a été supprimé — réessaie.",
  "account.delete.deleting": "Suppression…",
  "account.delete.confirm": "Supprimer définitivement mon compte",
  "account.delete.done_deactivated": "Ton compte est désactivé.",
  "account.delete.done_restore":
    "Si tu changes d’avis, reconnecte-toi avant cette date : ton compte sera restauré en un clic.",
  "account.delete.done_subscription":
    "Ton abonnement a été résilié et ne sera pas réactivé automatiquement.",
  "account.delete.done_thanks":
    "Merci d’avoir fait un bout de chemin avec Sophia. Prends soin de toi.",
  "account.purge.lead": "Toutes tes données seront",
  "account.purge.on": "définitivement supprimées le {date}",
  "account.purge.soon": "définitivement supprimées dans 7 jours",
  "account.pending.title": "Ton compte est en cours de suppression",
  "account.pending.restore_body":
    "D’ici là, tu peux restaurer ton compte en un clic : tout est remis en place (plans, conversations, souvenirs, rappels).",
  "account.pending.subscription":
    "Si tu avais un abonnement, il a été résilié et ne sera pas réactivé automatiquement : tu peux en reprendre un depuis la page Abonnement.",
  "account.pending.error": "La restauration a échoué. Réessaie, ou écris à sophia@sophia-coach.ai.",
  "account.pending.restoring": "Restauration…",
  "account.pending.restore": "Restaurer mon compte",
} satisfies TranslatedMessagesOf<"account">;
