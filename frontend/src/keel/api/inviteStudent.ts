// KEEL — envoyer (ou RENVOYER) l'invitation d'un élève.
//
// POURQUOI CE MODULE EXISTE
// -------------------------
// Deux surfaces appellent maintenant `coach-invite-student-v1`: le dialogue
// d'invitation, et le bouton « renvoyer » de chaque invitation en attente. La
// lecture de `send_state` — c'est-à-dire la différence entre « parti » et
// « supprimé » — est la seule chose que ces deux surfaces ne doivent PAS
// réimplémenter chacune à sa façon: c'est précisément là que le dialogue avait
// déjà menti une fois, en ignorant le champ.
//
// La décision est donc pure et testée ici; l'appel réseau est la coquille.
//
// ── LE RENVOI N'EST PAS UN NOUVEL ENDPOINT ────────────────────────────────
// `coach-invite-student-v1` est déjà idempotent-avec-fenêtre: hors d'une
// fenêtre de 60 s (`INVITE_REUSE_WINDOW_SECONDS`), il RÉVOQUE l'invitation
// pendante et en réémet une neuve — « The old link stops working, which is the
// correct behaviour for a resend », dit son propre commentaire. Renvoyer, c'est
// donc rappeler la même fonction avec la même adresse. Un second endpoint
// « resend » aurait dupliqué la garde d'abus, la révocation et le journal.

import { type MessageKey } from "../i18n/t";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Les QUATRE états que le serveur peut rendre. `already_sent` est le quatrième,
 * et il manquait à la première lecture: il n'apparaît que dans la fenêtre de
 * 60 s (double-clic), et il signifie « rien n'est parti CETTE fois ».
 */
export const INVITE_SEND_STATES = [
  "sent",
  "already_sent",
  "skipped_ephemeral",
  "skipped_delivery_disabled",
] as const;
export type InviteSendState = (typeof INVITE_SEND_STATES)[number];

/**
 * Un état inconnu est traité comme « parti », DÉLIBÉRÉMENT.
 *
 * L'invitation EST créée quand le serveur rend 200 — c'est ce que son
 * write-through garantit. Refuser de l'annoncer sur un token qu'on ne connaît
 * pas pousserait le coach à réinviter, ce qui révoquerait le lien qui vient
 * d'être émis. On penche vers l'état réel du produit, jamais vers l'alarme.
 */
export function normalizeInviteSendState(raw: unknown): InviteSendState {
  const value = String(raw ?? "");
  return (INVITE_SEND_STATES as readonly string[]).includes(value)
    ? (value as InviteSendState)
    : "sent";
}

/** Le titre du dialogue: ce qui s'est passé, en une phrase, avec l'adresse. */
export function inviteTitleKey(state: InviteSendState): MessageKey {
  if (state === "sent") return "invite.sent";
  if (state === "already_sent") return "invite.already_sent";
  return "invite.created_not_sent";
}

/**
 * Le bloc d'explication, quand il en faut un. `null` = rien à ajouter.
 *
 * `already_sent` n'en a pas: son titre dit déjà tout, et un encadré d'alerte
 * sur un double-clic transformerait une non-action en incident.
 */
export function inviteWarningKey(state: InviteSendState): MessageKey | null {
  if (state === "skipped_delivery_disabled") return "invite.not_sent_delivery_disabled";
  if (state === "skipped_ephemeral") return "invite.not_sent_ephemeral";
  return null;
}

/** La ligne courte affichée SUR la ligne d'invitation après un renvoi. */
export function inviteResendMessageKey(state: InviteSendState): MessageKey {
  switch (state) {
    case "sent":
      return "invite.resend_sent";
    case "already_sent":
      return "invite.resend_already";
    case "skipped_ephemeral":
      return "invite.resend_ephemeral";
    case "skipped_delivery_disabled":
      return "invite.resend_not_sent";
  }
}

/** Un renvoi qui n'a rien envoyé se lit en ambre, jamais en vert. */
export function inviteStateIsReassuring(state: InviteSendState): boolean {
  return state === "sent";
}

/**
 * Jetons de refus du serveur (R1: ASCII, jamais traduits) → ce qu'un coach doit
 * lire. R7 dans l'esprit: un code non mappé affiche le jeton brut plutôt qu'un
 * message générique apaisant, pour qu'un état serveur non traité soit visible
 * au lieu d'être lissé.
 */
export const INVITE_REFUSALS: Record<string, string> = {
  student_already_coached:
    "This person already follows another coach's program. They can join you after they end that relationship from their account.",
  already_your_student: "They are already your student.",
  self_invitation: "That is your own address.",
  not_an_active_coach: "Your coach account is not active, so invitations cannot be sent.",
  invalid_email: "That does not look like an email address.",
  invite_failed: "The invitation was not sent. Nothing was created — try again.",
};

export interface InviteResult {
  /** L'adresse NORMALISÉE que le serveur a réellement classée. */
  email: string;
  state: InviteSendState;
}

/**
 * L'appel. Lève une `Error` porteuse d'une phrase lisible sur refus — les deux
 * appelants l'affichent tel quel.
 */
export async function sendStudentInvitation(
  email: string,
  accessToken: string,
): Promise<InviteResult> {
  const res = await fetch(`${FUNCTIONS_BASE}/coach-invite-student-v1`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ email }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    email?: string;
    send_state?: string;
  };
  if (!res.ok || !json.ok) {
    const code = String(json.error ?? `http_${res.status}`);
    throw new Error(INVITE_REFUSALS[code] ?? code);
  }
  // Annoncé UNIQUEMENT depuis ce qui est revenu: le serveur énonce l'adresse
  // normalisée qu'il a classée, pas celle tapée dans la boîte.
  return {
    email: json.email ?? email,
    state: normalizeInviteSendState(json.send_state),
  };
}
