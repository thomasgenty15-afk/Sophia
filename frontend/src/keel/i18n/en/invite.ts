// Seed anglais — le namespace `invite`, et lui seul.
// Assemblé dans `../en.ts`; une clé `invite.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enInvite = {
  // Invitation
  "invite.title": "Invite a student",
  "invite.email_label": "Student email",
  "invite.send_button": "Send invitation",
  "invite.sent": "Invitation sent to {email}",
  // L'invitation EXISTE et son lien marche; c'est l'envoi qui a été supprimé.
  // Le titre dit donc « created », pas « sent » — et surtout pas « failed ».
  "invite.created_not_sent": "Invitation created for {email} — but no email went out.",
  // « envoyez-le vous-même » A ÉTÉ RETIRÉ D'ICI, et c'était le même défaut que
  // celui qu'on vient de corriger: le navigateur du coach ne voit JAMAIS le
  // jeton (`coach-invite-student-v1` n'échoue le join_url qu'à un appelant
  // porteur du secret interne, et seul le sha256 est en base). Lui conseiller de
  // transmettre le lien lui-même, c'était lui demander l'impossible dans le
  // message censé le sortir de sa confusion.
  "invite.not_sent_delivery_disabled":
    "Email delivery is switched off in this environment (EMAIL_DELIVERY_ENABLED), so nothing was sent. The invitation is on file, but its link only ever existed inside that email — nobody can retrieve it now. Turn delivery on, then invite this address again: that sends a fresh link and cancels this one.",
  "invite.not_sent_ephemeral":
    "This looks like a throwaway test address, so no email was sent on purpose. The invitation itself is real.",
  // `already_sent`: la fenêtre de réutilisation de 60 s du serveur, c'est-à-dire
  // un double-clic. Rien n'est parti CETTE fois, et le dire évite que le coach
  // compte un envoi de plus qui n'a pas eu lieu.
  "invite.already_sent":
    "A link went out to {email} moments ago — nothing new was sent. Wait a minute if you want a fresh one.",
  // Les lignes courtes, affichées SUR la ligne d'invitation après un renvoi.
  "invite.resend_sent": "A fresh link is on its way.",
  "invite.resend_already": "A link went out moments ago — nothing new was sent.",
  "invite.resend_not_sent": "No email went out: delivery is switched off in this environment.",
  "invite.resend_ephemeral": "Test address — no email sent, on purpose.",
  "invite.expired": "This invitation has expired. Ask your coach for a new one.",
  "invite.accept_title": "{coach} invited you to their coaching program",
  "invite.accept_button": "Accept invitation",
  // Shown when the invited address already has an account — the likeliest case
  // in a pilot, since a coach invites the clients they already have.
  "invite.existing_account_title": "You already have an account",
  "invite.existing_account_body":
    "This address is already registered, so there is nothing to create. Sign in and your coach's invitation is applied automatically — you don't have to come back to this link.",
  "invite.existing_account_cta": "Sign in and accept",
  "invite.already_in_title": "You're already in",
  "invite.already_in_body":
    "This invitation has been accepted and your coach is connected to your space. Nothing else to do here.",
  "invite.already_in_cta": "Go to my space",
  // Le coach dont la RPC n'a pas rendu le prénom, en OUVERTURE de phrase.
  // Séparé de `join.coach_fallback` (« your coach », en milieu de phrase) parce
  // que la capitale n'est pas une décision de code: en français les deux formes
  // diffèrent aussi par l'article, et une seule clé forcerait un `capitalize()`
  // qui se trompe dès qu'une langue met un déterminant devant.
  "invite.coach_fallback": "Your coach",

  // ── La fenêtre d'invitation du coach (`components/InviteDialog.tsx`) ──────
  // Quatre phrases qui étaient en dur dans le composant, dont un `placeholder`
  // et un état de bouton — les deux endroits qu'un scan de texte JSX ne voit
  // pas et que le lint attrape par attribut.
  "invite.dialog.session_expired":
    "Your session expired. Sign in again to invite a student.",
  "invite.dialog.link_note":
    "The link expires in 14 days and can be used once. Nothing exists in their name until they accept.",
  "invite.dialog.email_placeholder": "student@email.com",
  "invite.dialog.sending": "Sending...",
} as const
