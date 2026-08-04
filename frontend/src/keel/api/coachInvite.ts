// KEEL — carrying a coach invitation across the pre-auth journey.
//
// WHY THIS EXISTS
// `/join?token=...` is reached with no session. Until W7 the token travelled in
// exactly ONE way: as `coach_invite_token` inside `signUp` metadata, consumed by
// `handle_new_user`. That covers a brand-new account and nothing else.
//
// The population it does NOT cover is the likeliest one in a pilot: a client the
// coach ALREADY has, who already has an account. They open the link, are shown a
// signup form pre-filled with their own address, submit it, and Supabase refuses
// because the address is taken. The invitation stays `pending`, and the screen
// never says so — the observed defect (an invitation clicked, believed accepted,
// still pending in the database).
//
// So the token is persisted on arrival and replayed after ANY successful
// authentication — sign-in included. Same shape as `lib/referral.ts`, which
// solves the identical "intent precedes identity" problem for referral codes.
//
// WHAT THIS IS NOT: acceptance itself. A `coach_clients` row needs a
// `student_user_id`, so nothing can be linked before an identity exists. This
// module only makes the INTENT survive until one does; `accept_coach_invitation`
// remains the single writer, and it re-derives the coach from the token
// server-side. A tampered localStorage entry buys nothing: an unknown token is
// refused by the RPC.

import { supabase } from "../../lib/supabase";

const STORAGE_KEY = "sophia:coach_invite_token:v1";

/**
 * Invitations expire in 14 days server-side (`coach_invitations.expires_at`).
 * The client copy is deliberately shorter-lived than nothing at all but longer
 * than the server window, so the RPC — not this file — stays the authority on
 * expiry: a stale token is refused with `expired`, which has real copy on
 * screen, instead of vanishing silently here.
 */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Same loose shape guard as `preview_coach_invitation` (migration
 * 20260727200000): base64url, 20-200 chars. Loose on purpose — pinning the
 * current length would turn a future token change into a silent, uniform
 * refusal, which is the quiet failure R7 forbids.
 */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,200}$/;

type StoredToken = { token: string; stored_at: string };

export function normalizeInviteToken(raw: string | null | undefined): string | null {
  const cleaned = String(raw ?? "").trim();
  return TOKEN_RE.test(cleaned) ? cleaned : null;
}

export function storeCoachInviteToken(token: string): void {
  const normalized = normalizeInviteToken(token);
  if (!normalized) return;
  try {
    const payload: StoredToken = {
      token: normalized,
      stored_at: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode / quota: the in-URL token still works for this visit.
  }
}

export function getStoredCoachInviteToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredToken>;
    const token = normalizeInviteToken(parsed?.token);
    if (!token) return null;
    const storedAt = Date.parse(parsed?.stored_at ?? "");
    if (Number.isFinite(storedAt) && Date.now() - storedAt > MAX_AGE_MS) {
      clearStoredCoachInviteToken();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function clearStoredCoachInviteToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Capture `?token=` on arrival at /join, so it outlives the page. */
export function captureCoachInviteTokenFromUrl(search: string): string | null {
  try {
    const token = normalizeInviteToken(new URLSearchParams(search).get("token"));
    if (token) storeCoachInviteToken(token);
    return token;
  } catch {
    return null;
  }
}

export type ConsumeOutcome =
  | { kind: "none" }
  | { kind: "accepted"; coachFirstName: string | null }
  | { kind: "refused"; reason: string };

/**
 * Replay a stored invitation right after authentication.
 *
 * CLEARED ON EVERY DECIDED OUTCOME, accepted or refused. A token that the
 * server has ruled on is spent: keeping a refused one would re-fire the same
 * refusal at every future sign-in. A TRANSPORT failure is the one case that
 * keeps it — the server never ruled, so the intent is still live.
 *
 * Never throws. This runs on the sign-in path, where the invitation is a bonus:
 * a client whose invitation cannot be replayed must still reach their account.
 */
export async function consumePendingCoachInvitation(): Promise<ConsumeOutcome> {
  const token = getStoredCoachInviteToken();
  if (!token) return { kind: "none" };
  try {
    const { data, error } = await supabase.rpc("accept_coach_invitation", {
      p_token: token,
    });
    if (error) return { kind: "none" }; // transport failure: keep the token
    const result = data as unknown as
      | { accepted: true; coach_first_name: string | null }
      | { accepted: false; reason: string }
      | null;
    clearStoredCoachInviteToken();
    if (result?.accepted) {
      return { kind: "accepted", coachFirstName: result.coach_first_name ?? null };
    }
    return { kind: "refused", reason: result?.reason ?? "invalid_token" };
  } catch {
    return { kind: "none" };
  }
}
