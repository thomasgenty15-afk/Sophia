import { describe, expect, it } from "vitest";
import {
  type CoachEscalationRow,
  CONTACT_SILENT_AFTER_HOURS,
  CONTACT_SLIPPING_AFTER_HOURS,
  contactStateFor,
  countActiveSeats,
  countInvitedLinks,
  countPendingInvitationsFrom,
  heldStudents,
  invitationState,
  studentNameState,
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

// ── C9 · LES ESCALADES QUE PERSONNE NE LISAIT ───────────────────────────────
//
// Le défaut fermé ici n'est pas une erreur de code: `escalateMinorStudent`
// écrivait la bonne ligne (prouvé en HTTP réel le 2026-08-13 — 409 en 0,50 s,
// une ligne, `content_locale='en'`), et le coach avait le droit de la lire
// (policy `contract_change_requests_select_coach`). PERSONNE NE LA LISAIT: trois
// commentaires dans `frontend/src`, et un seul lecteur backend filtrant
// `reason_code='restriction_signal'`. L'élève, lui, lisait « your coach has been
// told ».
describe("heldStudents", () => {
  const active = (id: string) => ({ student_user_id: id, status: "active" });
  const esc = (over: Partial<CoachEscalationRow> = {}): CoachEscalationRow => ({
    id: "e1",
    user_id: "s1",
    reason_code: "minor_student",
    status: "open",
    student_words: "This student is 15 — under 18.",
    created_at: "2026-08-10T09:00:00.000Z",
    ...over,
  });
  const noName = () => null;

  it("rend l'élève suspendu, avec la phrase de la ligne et sa date", () => {
    const out = heldStudents([esc()], [active("s1")], () => "Nina");
    expect(out).toEqual([{
      userId: "s1",
      name: "Nina",
      words: "This student is 15 — under 18.",
      since: "2026-08-10T09:00:00.000Z",
    }]);
  });

  it("ignore une escalade FERMÉE — c'est une décision déjà prise", () => {
    expect(heldStudents([esc({ status: "resolved" })], [active("s1")], noName)).toEqual([]);
    expect(heldStudents([esc({ status: "dismissed" })], [active("s1")], noName)).toEqual([]);
  });

  it("ignore les AUTRES motifs, et c'est la garde qui compte", () => {
    // `restriction_signal` a déjà son lecteur (la synthèse du lundi) et son
    // propre traitement. Le remonter ici le doublerait sous un titre qui ment.
    expect(
      heldStudents([esc({ reason_code: "restriction_signal" })], [active("s1")], noName),
    ).toEqual([]);
  });

  it("ignore un lien qui n'est plus actif", () => {
    // `coached_student_ids()` ne renvoie pas un lien `paused`/`ended`: la ligne
    // s'afficherait sans nom, et son bouton ouvrirait un panneau de refus.
    for (const status of ["paused", "ended", "invited"]) {
      expect(heldStudents([esc()], [{ student_user_id: "s1", status }], noName)).toEqual([]);
    }
  });

  it("dédoublonne par élève et garde la PLUS ANCIENNE", () => {
    // L'idempotence de `escalateMinorStudent` interdit la seconde ligne, mais
    // une reprise en base peut la produire — et c'est la date d'attente réelle
    // qui doit rester à l'écran.
    const out = heldStudents(
      [
        esc({ id: "recent", created_at: "2026-08-12T09:00:00.000Z" }),
        esc({ id: "ancienne", created_at: "2026-08-01T09:00:00.000Z" }),
      ],
      [active("s1")],
      noName,
    );
    expect(out).toHaveLength(1);
    expect(out[0].since).toBe("2026-08-01T09:00:00.000Z");
  });

  it("trie du plus ancien au plus récent, à l'inverse des invitations", () => {
    // Une escalade `urgency='immediate'` qui traîne depuis six jours est celle
    // qu'on a oubliée; une invitation récente est celle qui vit encore.
    const out = heldStudents(
      [
        esc({ user_id: "s2", created_at: "2026-08-12T09:00:00.000Z" }),
        esc({ user_id: "s1", created_at: "2026-08-05T09:00:00.000Z" }),
      ],
      [active("s1"), active("s2")],
      noName,
    );
    expect(out.map((h) => h.userId)).toEqual(["s1", "s2"]);
  });

  it("rend `name: null` plutôt qu'un identifiant quand l'annuaire est muet", () => {
    // Même règle que la liste: un uuid à l'écran se lit comme une information
    // et n'en est pas. L'écran choisit alors sa propre phrase.
    expect(heldStudents([esc()], [active("s1")], () => "   ")[0].name).toBeNull();
    expect(heldStudents([esc()], [active("s1")], noName)[0].name).toBeNull();
  });

  it("ne fabrique pas de prose quand la ligne n'en porte pas", () => {
    expect(heldStudents([esc({ student_words: null })], [active("s1")], noName)[0].words)
      .toBe("");
  });
});

// ── C9 · « NOM MASQUÉ » SUR UN LIEN VIVANT ──────────────────────────────────
//
// Vu à l'écran le 2026-08-13, pas déduit: un élève au lien `active` affiché
// « Name hidden while this link is not active ». Mesuré ensuite en base:
// 9 liens actifs sur 359 portent un `full_name` vide.
describe("studentNameState", () => {
  it("préfère le nom, puis l'e-mail d'invitation", () => {
    expect(studentNameState({
      fullName: "  Nina  ",
      invitedEmail: "nina@test.dev",
      hasDirectoryRow: true,
      studentUserId: "s1",
    })).toEqual({ kind: "name", value: "Nina" });
    expect(studentNameState({
      fullName: null,
      invitedEmail: "nina@test.dev",
      hasDirectoryRow: false,
      studentUserId: null,
    })).toEqual({ kind: "email", value: "nina@test.dev" });
  });

  it("LIGNE PRÉSENTE + NOM VIDE ⇒ « pas encore écrit », jamais « masqué »", () => {
    // LE défaut du lot. Le blanc n'est pas un nom: `"   "` doit tomber ici et
    // pas rendre trois espaces en gras.
    for (const fullName of ["", "   ", null, undefined]) {
      expect(studentNameState({
        fullName,
        invitedEmail: null,
        hasDirectoryRow: true,
        studentUserId: "s1",
      })).toEqual({ kind: "no_name", value: null });
    }
  });

  it("LIGNE ABSENTE ⇒ masqué, et c'est la seule phrase vraie là", () => {
    // `coach_student_directory` filtre sur `coached_student_ids()`: pas de ligne
    // = pas de droit de lecture. C'est ça, et rien d'autre, « masqué ».
    expect(studentNameState({
      fullName: null,
      invitedEmail: null,
      hasDirectoryRow: false,
      studentUserId: "s1",
    })).toEqual({ kind: "hidden", value: null });
  });

  it("sans compte du tout ⇒ l'invitation, pas un élève", () => {
    expect(studentNameState({
      fullName: null,
      invitedEmail: null,
      hasDirectoryRow: false,
      studentUserId: null,
    })).toEqual({ kind: "unnamed", value: null });
  });
});
