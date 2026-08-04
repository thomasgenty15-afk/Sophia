import { describe, expect, it } from "vitest";
import {
  CONTACT_SILENT_AFTER_HOURS,
  CONTACT_SLIPPING_AFTER_HOURS,
  contactStateFor,
  countActiveSeats,
  countInvitedLinks,
  countPendingInvitationsFrom,
  invitationState,
  visibleInvitations,
} from "./coachCohort";

const NOW = new Date("2026-08-03T12:00:00.000Z");
const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("cohort contact state", () => {
  it("opens `slipping` exactly where the nudge fires", () => {
    // 48h is the state the re-engagement loop acts on (§1.3). If the screen
    // opened later, a coach would read "in touch" about a student the system
    // has already decided to chase.
    expect(contactStateFor(hoursAgo(2), NOW)).toBe("responsive");
    expect(contactStateFor(hoursAgo(47), NOW)).toBe("responsive");
    expect(contactStateFor(hoursAgo(CONTACT_SLIPPING_AFTER_HOURS), NOW)).toBe("slipping");
    expect(contactStateFor(hoursAgo(119), NOW)).toBe("slipping");
    expect(contactStateFor(hoursAgo(CONTACT_SILENT_AFTER_HOURS), NOW)).toBe("silent");
  });

  it("treats never-spoken and unreadable as silent, never as in touch", () => {
    expect(contactStateFor(null, NOW)).toBe("silent");
    expect(contactStateFor(undefined, NOW)).toBe("silent");
    expect(contactStateFor("not-a-date", NOW)).toBe("silent");
  });
});

describe("seat counting", () => {
  it("counts ONLY active links, so screen and invoice cannot diverge", () => {
    const clients = [
      { status: "active" },
      { status: "active" },
      { status: "invited" },
      { status: "paused" },
      { status: "ended" },
    ];
    expect(countActiveSeats(clients)).toBe(2);
    expect(countInvitedLinks(clients)).toBe(1);
  });

  it("an empty roster costs nothing", () => {
    expect(countActiveSeats([])).toBe(0);
    expect(countInvitedLinks([])).toBe(0);
  });
});

// ── LES INVITATIONS EN ATTENTE ────────────────────────────────────────────
//
// LE DÉFAUT QUE CES TESTS FIGENT, ET IL A ÉTÉ RAPPORTÉ PAR UN COACH:
// « on n'a aucune idée de qui est en attente de confirmation d'invitation ».
//
// La tuile « en attente » de l'accueil coach comptait
// `coach_clients.status === 'invited'`. Mesuré sur la base locale: 8 invitations
// `pending` et ZÉRO ligne `coach_clients` en `invited`, parce que
// `coach-invite-student-v1` n'écrit que `coach_invitations` et que le lien
// n'apparaît qu'à l'acceptation. La tuile affichait un zéro PERMANENT — pas une
// information manquante, une information fausse.

const HOUR = 3_600_000;
const now = new Date("2026-08-05T12:00:00.000Z");
const inv = (over: Partial<Parameters<typeof visibleInvitations>[0][number]> = {}) => ({
  id: over.id ?? "i1",
  email: over.email ?? "someone@example.com",
  status: over.status ?? "pending",
  created_at: over.created_at ?? "2026-08-05T09:00:00.000Z",
  expires_at: over.expires_at ?? new Date(now.getTime() + 10 * 24 * HOUR).toISOString(),
});

describe("invitationState", () => {
  it("a pending invitation whose date has passed is EXPIRED, whatever the column says", () => {
    // `accept_coach_invitation_for_user` ne brûle le statut en 'expired' que
    // lorsqu'on ouvre le lien. Une invitation morte depuis trois jours est donc
    // encore 'pending' en base — et l'afficher « en attente » fait attendre le
    // coach après quelqu'un qui ne peut plus entrer.
    const dead = inv({ expires_at: new Date(now.getTime() - 3 * 24 * HOUR).toISOString() });
    expect(dead.status).toBe("pending");
    expect(invitationState(dead, now)).toBe("expired");
  });

  it("keeps a live invitation pending", () => {
    expect(invitationState(inv(), now)).toBe("pending");
  });

  it("trusts the column when it has already been burnt", () => {
    for (const status of ["accepted", "revoked", "expired"] as const) {
      expect(invitationState(inv({ status }), now)).toBe(status);
    }
  });

  it("an unparseable date does not kill the invitation on screen", () => {
    // Un parse raté ne doit pas déclarer morte une invitation qui vit.
    expect(invitationState(inv({ expires_at: "not-a-date" }), now)).toBe("pending");
  });
});

describe("countPendingInvitationsFrom", () => {
  it("counts the LIVE ones, which is what the tile promised all along", () => {
    const rows = [
      inv({ id: "a" }),
      inv({ id: "b" }),
      inv({ id: "c", expires_at: new Date(now.getTime() - HOUR).toISOString() }),
      inv({ id: "d", status: "accepted" }),
      inv({ id: "e", status: "revoked" }),
    ];
    expect(countPendingInvitationsFrom(rows, now)).toBe(2);
  });

  it("is zero when there is genuinely nothing pending", () => {
    expect(countPendingInvitationsFrom([], now)).toBe(0);
    expect(countPendingInvitationsFrom([inv({ status: "accepted" })], now)).toBe(0);
  });
});

describe("visibleInvitations", () => {
  it("shows pending first, then expired, newest first inside each group", () => {
    const rows = [
      inv({ id: "old-pending", created_at: "2026-08-01T09:00:00.000Z" }),
      inv({ id: "dead", expires_at: new Date(now.getTime() - HOUR).toISOString() }),
      inv({ id: "new-pending", created_at: "2026-08-05T11:00:00.000Z" }),
    ];
    expect(visibleInvitations(rows, now).map((i) => i.id)).toEqual([
      "new-pending",
      "old-pending",
      "dead",
    ]);
  });

  it("KEEPS expired invitations, because that is the row the coach must act on", () => {
    const rows = [inv({ id: "dead", expires_at: "2026-08-01T09:00:00.000Z" })];
    const out = visibleInvitations(rows, now);
    expect(out).toHaveLength(1);
    expect(out[0].state).toBe("expired");
  });

  it("drops accepted and revoked, which would be noise", () => {
    // Un accepté est devenu élève: il est dans la cohorte, l'afficher deux fois
    // n'aide personne. Un révoqué, le coach l'a annulé lui-même.
    const rows = [inv({ id: "a", status: "accepted" }), inv({ id: "r", status: "revoked" })];
    expect(visibleInvitations(rows, now)).toEqual([]);
  });
});
