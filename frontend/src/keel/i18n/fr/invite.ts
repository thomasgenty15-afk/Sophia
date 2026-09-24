// Pack français — le namespace `invite`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `invite.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frInvite = {
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
} satisfies TranslatedMessagesOf<"invite">;
