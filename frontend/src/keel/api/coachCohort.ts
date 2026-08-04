/**
 * PIVOT §1.4 — the cohort screen's pure helpers.
 *
 * Extracted from `CoachHomePage.tsx` because a component file that also exports
 * plain functions breaks React Fast Refresh (`react-refresh/only-export-
 * components`): the whole module reloads instead of the component, and state is
 * lost on every edit. The functions were already written to be tested in
 * isolation, so the move costs nothing and buys back the dev loop.
 */

/** The billing unit. Derived from the rows, never stored. */
export function countActiveSeats(clients: readonly { status: string }[]): number {
  return clients.filter((c) => c.status === "active").length;
}

/**
 * ⚠️ NE COMPTE PAS LES INVITATIONS. Conservée sous son vrai nom.
 *
 * MESURÉ le 2026-08-05 sur la base locale : 8 invitations `pending`, et
 * `coach_clients` avec `status='invited'` → **0 lignes**. Ce n'est pas un
 * hasard de jeu de données, c'est structurel : `coach-invite-student-v1`
 * n'écrit QUE `coach_invitations`, et la ligne `coach_clients` n'apparaît
 * qu'à l'ACCEPTATION (`keel_attach_student_to_coach` l'insère alors en
 * `active`). Un lien `invited` n'est donc jamais produit par le chemin
 * d'invitation.
 *
 * Branchée sur la tuile « en attente » de l'accueil coach, elle affichait donc
 * un zéro permanent — et c'est ce qui a fait dire à un coach qu'il n'avait
 * « aucune idée de qui est en attente ». Le compteur n'était pas absent, il
 * était faux, ce qui est pire : un zéro se lit comme une réponse.
 *
 * Le vrai compteur est `countPendingInvitationsFrom` ci-dessous, qui lit
 * `coach_invitations`. Celle-ci reste parce qu'un lien `invited` est un état
 * LÉGAL du schéma (le CHECK l'autorise, et une reprise manuelle pourrait en
 * produire) : ce qu'elle compte est réel, ce n'est simplement pas ce qu'on
 * croyait lui demander.
 */
export function countInvitedLinks(
  clients: readonly { status: string }[],
): number {
  return clients.filter((c) => c.status === "invited").length;
}

/** Une invitation telle que `coach_invitations` la porte. */
export interface CoachInvitationRow {
  id: string;
  email: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export type InvitationState = "pending" | "expired" | "accepted" | "revoked";

/**
 * L'état d'une invitation TEL QU'UN COACH DOIT LE LIRE, et il ne se déduit pas
 * de la seule colonne `status`.
 *
 * `coach_invitations.status` reste `'pending'` après la date d'expiration :
 * `accept_coach_invitation_for_user` ne la brûle en `'expired'` que la première
 * fois que quelqu'un l'ouvre (« burn it while we hold the lock »). Une
 * invitation morte depuis trois jours s'affiche donc `pending` en base.
 *
 * Afficher « en attente » sur ce lien-là, c'est faire attendre le coach après
 * quelqu'un qui ne peut plus entrer. La date tranche, pas la colonne.
 */
export function invitationState(
  row: Pick<CoachInvitationRow, "status" | "expires_at">,
  now: Date,
): InvitationState {
  if (row.status === "accepted") return "accepted";
  if (row.status === "revoked") return "revoked";
  if (row.status === "expired") return "expired";
  const expiresAt = Date.parse(row.expires_at);
  // Une date illisible ne fait pas disparaître l'invitation de l'écran: on la
  // laisse en attente plutôt que de la déclarer morte sur un parse raté.
  if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) return "expired";
  return "pending";
}

/** Ce que la tuile « en attente » doit compter: les invitations VIVANTES. */
export function countPendingInvitationsFrom(
  invitations: readonly Pick<CoachInvitationRow, "status" | "expires_at">[],
  now: Date,
): number {
  return invitations.filter((i) => invitationState(i, now) === "pending").length;
}

/**
 * Ce que l'écran affiche: les invitations qui MÉRITENT une place, les vivantes
 * d'abord, les expirées ensuite.
 *
 * Les `accepted` sortent de la liste — la personne est devenue élève, elle
 * apparaît dans la cohorte, et l'y voir deux fois est du bruit. Les `revoked`
 * aussi : le coach les a annulées lui-même.
 *
 * Les EXPIRÉES restent, et c'est le point: une invitation morte est
 * précisément celle sur laquelle le coach doit agir (renvoyer). La cacher, c'est
 * reproduire en plus petit le défaut qu'on vient de corriger.
 */
export function visibleInvitations(
  invitations: readonly CoachInvitationRow[],
  now: Date,
): Array<CoachInvitationRow & { state: InvitationState }> {
  const rank: Record<string, number> = { pending: 0, expired: 1 };
  return invitations
    .map((i) => ({ ...i, state: invitationState(i, now) }))
    .filter((i) => i.state === "pending" || i.state === "expired")
    .sort((a, b) =>
      rank[a.state] - rank[b.state] ||
      Date.parse(b.created_at) - Date.parse(a.created_at)
    );
}

/**
 * The cohort screen's three states: "actif / glisse / silencieux" (§1.4).
 *
 * A THIRD AXIS, NOT A REPLACEMENT for `coach_clients.status`. That column
 * answers "is this link live, and is it billable"; this answers "is this person
 * still with us". A student can be an `active` billable seat and silent for
 * nine days — not a contradiction, two different questions. Merging them is how
 * an invoice ends up wired to an engagement screen.
 *
 * The thresholds mirror the re-engagement decider: 48h opens `slipping` (the
 * state the nudge acts on), 120h is `silent` (a nudge already went out
 * unanswered). `_shared/keel/coach_synthesis.ts` carries the drift test that
 * keeps the two in step.
 */
export type ContactState = "responsive" | "slipping" | "silent";

export const CONTACT_SLIPPING_AFTER_HOURS = 48;
export const CONTACT_SILENT_AFTER_HOURS = 120;

export function contactStateFor(
  lastInboundAt: string | null | undefined,
  now: Date,
): ContactState {
  if (!lastInboundAt) return "silent";
  const last = new Date(lastInboundAt);
  if (Number.isNaN(last.getTime())) return "silent";
  const hours = (now.getTime() - last.getTime()) / 3_600_000;
  if (hours >= CONTACT_SILENT_AFTER_HOURS) return "silent";
  if (hours >= CONTACT_SLIPPING_AFTER_HOURS) return "slipping";
  return "responsive";
}

export const CONTACT_LABEL: Record<ContactState, string> = {
  responsive: "In touch",
  slipping: "Slipping",
  silent: "Silent",
};
