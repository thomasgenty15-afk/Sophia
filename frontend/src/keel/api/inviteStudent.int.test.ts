import { describe, expect, it } from "vitest";
import {
  INVITE_REFUSALS,
  INVITE_SEND_STATES,
  type InviteSendState,
  inviteResendMessageKey,
  inviteStateIsReassuring,
  inviteTitleKey,
  inviteWarningKey,
  normalizeInviteSendState,
} from "./inviteStudent";
import { en } from "../i18n/en";

// CE QUE CE FICHIER PROTÈGE
//
// `coach-invite-student-v1` distingue quatre états d'envoi, et son commentaire
// dit pourquoi: « skipped_delivery_disabled EXISTE POUR NE PAS MENTIR EN LOCAL ».
// Le dialogue d'invitation ignorait le champ et affichait « Invitation sent to
// … » dans tous les cas — un coach a donc cru avoir invité quelqu'un alors que
// `communication_logs` disait `status='skipped'`, `resend_id='resend_DISABLED'`.
//
// Deux surfaces lisent maintenant ce champ (le dialogue, et le bouton
// « renvoyer » de la liste). Ces tests asservissent la table de correspondance
// pour qu'aucune des deux ne puisse redevenir rassurante à tort.

describe("normalizeInviteSendState", () => {
  it("keeps every state the server can actually return", () => {
    for (const state of INVITE_SEND_STATES) {
      expect(normalizeInviteSendState(state)).toBe(state);
    }
  });

  it("includes already_sent, the one the first reading missed", () => {
    // Il n'apparaît que dans la fenêtre de 60 s (double-clic) et signifie
    // « rien n'est parti CETTE fois ». Traité comme `sent`, il aurait affiché
    // « Invitation sent » sur une non-action.
    expect(INVITE_SEND_STATES).toContain("already_sent");
    expect(normalizeInviteSendState("already_sent")).toBe("already_sent");
  });

  it("falls back to sent on an unknown state, and that is deliberate", () => {
    // L'invitation EST créée quand le serveur rend 200. Alarmer pousserait le
    // coach à réinviter, ce qui révoquerait le lien qui vient d'être émis.
    for (const raw of [undefined, null, "", "some_future_state", 42, {}]) {
      expect(normalizeInviteSendState(raw)).toBe("sent");
    }
  });
});

describe("what the coach reads", () => {
  it("only `sent` is reassuring", () => {
    expect(inviteStateIsReassuring("sent")).toBe(true);
    for (const state of ["already_sent", "skipped_ephemeral", "skipped_delivery_disabled"] as const) {
      expect(inviteStateIsReassuring(state)).toBe(false);
    }
  });

  it("never claims an email went out when none did", () => {
    // LE TEST QUI PORTE LE DÉFAUT. Les trois états non-`sent` ne doivent JAMAIS
    // retomber sur la phrase « Invitation sent to {email} ».
    for (const state of ["already_sent", "skipped_ephemeral", "skipped_delivery_disabled"] as const) {
      expect(inviteTitleKey(state)).not.toBe("invite.sent");
    }
    expect(inviteTitleKey("sent")).toBe("invite.sent");
  });

  it("maps every state to messages that EXIST in the catalogue", () => {
    // `t()` lève en dev sur une clé inconnue: une entrée manquante casserait
    // l'écran au moment précis où on essaie d'expliquer un envoi supprimé.
    for (const state of INVITE_SEND_STATES) {
      expect(en[inviteTitleKey(state)], `title for ${state}`).toBeTruthy();
      expect(en[inviteResendMessageKey(state)], `resend line for ${state}`).toBeTruthy();
      const warning = inviteWarningKey(state);
      if (warning) expect(en[warning], `warning for ${state}`).toBeTruthy();
    }
  });

  it("explains itself when nothing was sent, and stays quiet on a double click", () => {
    expect(inviteWarningKey("skipped_delivery_disabled")).toBe(
      "invite.not_sent_delivery_disabled",
    );
    expect(inviteWarningKey("skipped_ephemeral")).toBe("invite.not_sent_ephemeral");
    // Un encadré d'alerte sur un double-clic transformerait une non-action en
    // incident.
    expect(inviteWarningKey("already_sent")).toBeNull();
    expect(inviteWarningKey("sent")).toBeNull();
  });

  it("gives each state its own resend line", () => {
    const keys = INVITE_SEND_STATES.map((s) => inviteResendMessageKey(s));
    expect(new Set(keys).size).toBe(INVITE_SEND_STATES.length);
  });
});

describe("refusals", () => {
  it("speaks to the coach, never in server tokens", () => {
    for (const [token, sentence] of Object.entries(INVITE_REFUSALS)) {
      expect(sentence).not.toBe(token);
      expect(sentence.length).toBeGreaterThan(20);
    }
  });

  it("covers the refusal a resend can realistically hit", () => {
    // Renvoyer à quelqu'un qui a accepté entre-temps chez un autre coach est le
    // cas non hypothétique: il faut une phrase, pas `student_already_coached`.
    expect(INVITE_REFUSALS.student_already_coached).toBeTruthy();
    expect(INVITE_REFUSALS.already_your_student).toBeTruthy();
  });
});

describe("the state union is closed", () => {
  it("has exactly the four states the server implements", () => {
    // Si le serveur en ajoute un cinquième, ce test doit tomber et forcer la
    // mise à jour de la table plutôt que de le laisser retomber sur `sent`.
    const expected: InviteSendState[] = [
      "sent",
      "already_sent",
      "skipped_ephemeral",
      "skipped_delivery_disabled",
    ];
    expect([...INVITE_SEND_STATES]).toEqual(expected);
  });
});
