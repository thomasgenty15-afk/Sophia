import React from "react";
import { supabase } from "../../lib/supabase";
import { t } from "../i18n/t";

// KEEL — invite a student (BUILD_PLAN W6.5).
//
// The dialog carries no logic of its own beyond one POST: the token is minted
// server-side, only its sha256 is stored, and the clear value goes to the
// invitee's mailbox. THIS SCREEN NEVER SEES THE TOKEN — coach-invite-student-v1
// echoes the join URL only to a caller holding the internal secret, which a
// browser never has. So there is no "copy the link" affordance here, and that
// absence is the feature.
//
// I18N NOTE (W6.3 scope): the four keys this dialog needs already exist in
// keel/i18n/en.ts (`invite.title`, `invite.email_label`, `invite.send_button`,
// `invite.sent`). The refusal copy below is inline English because en.ts sits
// outside this lot's file perimeter; W9 consolidates it. Every string here is
// already English, so nothing is mistranslated in the meantime — it is only
// unreachable from the locale table.

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Server refusal tokens (R1: ASCII, never translated) mapped to what a coach
 * should read. R7 in spirit: an unmapped code shows the raw token rather than
 * a soothing generic message, so an unhandled server state is visible instead
 * of smoothed over.
 */
const REFUSALS: Record<string, string> = {
  student_already_coached:
    "This person already follows another coach's program. They can join you after they end that relationship from their account.",
  already_your_student: "They are already your student.",
  self_invitation: "That is your own address.",
  not_an_active_coach: "Your coach account is not active, so invitations cannot be sent.",
  invalid_email: "That does not look like an email address.",
  invite_failed: "The invitation was not sent. Nothing was created — try again.",
};

type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

export function InviteDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited?: () => void;
}) {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<SendState>({ kind: "idle" });

  React.useEffect(() => {
    if (open) {
      setEmail("");
      setState({ kind: "idle" });
    }
  }, [open]);

  if (!open) return null;

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setState({ kind: "sending" });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Your session expired. Sign in again to invite a student.");
      }
      const res = await fetch(`${FUNCTIONS_BASE}/coach-invite-student-v1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        email?: string;
      };
      if (!res.ok || !json.ok) {
        const code = String(json.error ?? `http_${res.status}`);
        throw new Error(REFUSALS[code] ?? code);
      }
      // Announced only from what came back: the server states the normalised
      // address it actually filed, not the one typed into the box.
      setState({ kind: "sent", email: json.email ?? email });
      onInvited?.();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-gray-900">{t("invite.title")}</h2>

        {state.kind === "sent"
          ? (
            <div className="mt-4">
              <p className="text-sm text-gray-700">
                {t("invite.sent", { email: state.email })}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                The link expires in 14 days and can be used once. Nothing exists in
                their name until they accept.
              </p>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded bg-gray-900 px-4 py-2 text-sm text-white"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          )
          : (
            <form onSubmit={send} className="mt-4">
              <label
                htmlFor="keel-invite-email"
                className="block text-sm font-medium text-gray-700"
              >
                {t("invite.email_label")}
              </label>
              <input
                id="keel-invite-email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="student@email.com"
              />

              {state.kind === "error" && (
                <p className="mt-3 text-sm text-rose-700">{state.message}</p>
              )}

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={state.kind === "sending" || email.trim() === ""}
                  className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40"
                >
                  {state.kind === "sending" ? "Sending..." : t("invite.send_button")}
                </button>
              </div>
            </form>
          )}
      </div>
    </div>
  );
}

export default InviteDialog;
