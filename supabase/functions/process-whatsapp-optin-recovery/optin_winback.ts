/// <reference path="../tsserver-shims.d.ts" />

// Pure decision logic for the 3-touch opt-in winback sequence.
//
// Target audience: users who generated a plan on the web and received the
// WhatsApp opt-in template ("sent") but never crossed the WhatsApp threshold
// ("not confirmed"). The temporal anchor is `profiles.whatsapp_optin_sent_at`
// (falling back to `whatsapp_optin_recovery.first_detected_at`).
//
// Sequence (anchor = T):
//   - Touch 1 — email          — as soon as elapsed >= 1 day.
//   - Touch 2 — WhatsApp tpl    — as soon as elapsed >= 3 days AND touch 1 sent.
//   - Touch 3 — email (final)   — as soon as elapsed >= 5 days AND touch 2 sent.
//
// Invariants enforced here:
//   - AT MOST ONE touch per cron pass (the function returns a single touch).
//   - Each touch is idempotent: a touch whose timestamp is already set is never
//     returned again.
//   - Ordering: a later touch never fires before its predecessor was sent.
//   - opted_in => "resolved" (THE validated stop condition), never a touch.

const DAY_MS = 24 * 60 * 60 * 1000;

export const TOUCH1_DELAY_MS = 1 * DAY_MS;
export const TOUCH2_DELAY_MS = 3 * DAY_MS;
export const TOUCH3_DELAY_MS = 5 * DAY_MS;

export type OptinWinbackTouch =
  | "touch1"
  | "touch2"
  | "touch3"
  | "resolved"
  | "none";

export type DecideOptinWinbackInput = {
  // Anchor timestamp in ms (whatsapp_optin_sent_at ?? first_detected_at).
  anchorAt: number | null;
  // Current time in ms.
  now: number;
  // Touch timestamps in ms, or null when the touch was never sent.
  touch1SentAt: number | null;
  touch2SentAt: number | null;
  touch3SentAt: number | null;
  // Stop condition: the user has confirmed the WhatsApp opt-in.
  optedIn: boolean;
};

export function decideNextOptinWinbackTouch(
  input: DecideOptinWinbackInput,
): OptinWinbackTouch {
  // Validated stop condition: once opted in, the sequence is done for good.
  if (input.optedIn) return "resolved";

  const anchorAt = input.anchorAt;
  if (anchorAt == null || !Number.isFinite(anchorAt)) return "none";

  const elapsed = input.now - anchorAt;

  // Descending order guarantees "at most one touch" and that the prerequisite
  // chain holds. The three branches are mutually exclusive in practice: only
  // the single "next unsent" touch can have its predecessor satisfied and its
  // own timestamp still null.
  if (
    input.touch3SentAt == null &&
    input.touch2SentAt != null &&
    elapsed >= TOUCH3_DELAY_MS
  ) {
    return "touch3";
  }
  if (
    input.touch2SentAt == null &&
    input.touch1SentAt != null &&
    elapsed >= TOUCH2_DELAY_MS
  ) {
    return "touch2";
  }
  if (input.touch1SentAt == null && elapsed >= TOUCH1_DELAY_MS) {
    return "touch1";
  }
  return "none";
}
