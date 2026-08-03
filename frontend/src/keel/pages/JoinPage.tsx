import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  clearStoredCoachInviteToken,
  storeCoachInviteToken,
} from "../api/coachInvite";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";
import { t } from "../i18n/t";

// KEEL — /join?token=... (BUILD_PLAN W6.5)
//
// The only page of the product reachable with no account and no session. It
// speaks to exactly one RPC before authentication — `preview_coach_invitation`
// — which returns the coach's FIRST NAME and the invited email, and nothing
// else. Everything this screen can display about the coaching relationship is
// therefore already in the hand of whoever opened the email link.
//
// TWO PATHS OUT, ONE ENGINE. A signed-in visitor accepts through
// `accept_coach_invitation`. A visitor without an account signs up, and the
// token rides in `raw_user_meta_data.coach_invite_token` so `handle_new_user()`
// applies it inside a try/catch — the referral-attribution pattern of
// migration 20260708160000. A bug in the invitation can therefore cost the
// link, never the account.
//
// NO BLANK SCREEN, EVER. Every refusal token the RPC can emit has copy below.
// An expired link is the single most likely way a real person meets this page,
// and it must read as a fixable situation, not as a broken product.
//
// I18N NOTE (W6.3 scope): `invite.accept_title`, `invite.accept_button` and
// `invite.expired` come from keel/i18n/en.ts. The remaining copy is inline
// English because en.ts is outside this lot's file perimeter; W9 consolidates
// it. Nothing here is French.

interface PreviewOk {
  valid: true;
  coach_first_name: string | null;
  email: string | null;
}
interface PreviewRefusal {
  valid: false;
  reason: string;
}
type Preview = PreviewOk | PreviewRefusal;

/** R1 tokens from the RPC -> what a person should read. */
const PREVIEW_REFUSALS: Record<string, string> = {
  invalid_token:
    "This invitation link is not valid. Check that you copied the whole link from the email, or ask your coach to send a new one.",
  expired: t("invite.expired"),
  revoked: "Your coach cancelled this invitation. Ask them for a new one.",
  already_accepted:
    "This invitation has already been used. If that was you, sign in — your space is waiting.",
  coach_unavailable:
    "This coach's account is not active right now, so the invitation cannot be accepted.",
};

const ACCEPT_REFUSALS: Record<string, string> = {
  ...PREVIEW_REFUSALS,
  already_coached:
    "Your account already follows another coach's program. End that relationship from your account page first — we never move you between coaches without you doing it.",
  self_invitation: "This invitation was issued by your own coach account.",
};

type Phase =
  | { kind: "loading" }
  | { kind: "no_token" }
  | { kind: "refused"; message: string; reason?: string }
  | { kind: "ready"; coachName: string | null; email: string }
  | { kind: "accepting" }
  | { kind: "accepted"; coachName: string | null }
  | { kind: "existing_account" }
  | { kind: "check_email"; coachName: string | null };

/**
 * Supabase refuses a signup for a taken address. The wording is not a contract,
 * so the match is loose and the fallback is the raw message: a missed match
 * shows the server's own error, never a wrong screen.
 */
function isAlreadyRegistered(message: string): boolean {
  return /already\s*(been\s*)?regist|already\s*exists|user\s*already/i.test(message);
}

function headline(coachName: string | null): string {
  return t("invite.accept_title", { coach: coachName ?? "Your coach" });
}

export default function JoinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const token = params.get("token");

  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" });
  const [formError, setFormError] = React.useState<string | null>(null);

  // Signup fields (used only when there is no session).
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!token) {
      setPhase({ kind: "no_token" });
      return;
    }
    // The invitation outlives this page. Whatever the visitor does next — sign
    // in elsewhere, close the tab and come back, create the account from /auth —
    // the token is replayed at their first successful authentication.
    storeCoachInviteToken(token);
    (async () => {
      const { data, error } = await supabase.rpc("preview_coach_invitation", {
        p_token: token,
      });
      if (cancelled) return;
      if (error) {
        setPhase({
          kind: "refused",
          message:
            "We could not check this invitation right now. Reload the page to try again.",
        });
        return;
      }
      const preview = data as unknown as Preview | null;
      if (!preview || preview.valid !== true) {
        const reason = preview ? preview.reason : "invalid_token";
        setPhase({
          kind: "refused",
          message: PREVIEW_REFUSALS[reason] ?? PREVIEW_REFUSALS.invalid_token,
          reason,
        });
        return;
      }
      setEmail(preview.email ?? "");
      setPhase({
        kind: "ready",
        coachName: preview.coach_first_name,
        email: preview.email ?? "",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = async () => {
    if (!token) return;
    const coachName = phase.kind === "ready" ? phase.coachName : null;
    setPhase({ kind: "accepting" });
    const { data, error } = await supabase.rpc("accept_coach_invitation", {
      p_token: token,
    });
    if (error) {
      setPhase({
        kind: "refused",
        message: "That did not go through. Nothing changed — reload and try again.",
      });
      return;
    }
    const result = data as unknown as
      | { accepted: true; coach_first_name: string | null }
      | { accepted: false; reason: string };
    if (!result?.accepted) {
      const reason = result ? result.reason : "invalid_token";
      setPhase({
        kind: "refused",
        message: ACCEPT_REFUSALS[reason] ?? ACCEPT_REFUSALS.invalid_token,
      });
      return;
    }
    // Spent: the server has ruled. Leaving it in storage would replay the same
    // `already_accepted` at every future sign-in.
    clearStoredCoachInviteToken();
    setPhase({ kind: "accepted", coachName: result.coach_first_name ?? coachName });
  };

  const signUp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    const coachName = phase.kind === "ready" ? phase.coachName : null;
    setSubmitting(true);
    setFormError(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            // R3: the three locale axes stay separate. KEEL surfaces are born
            // in English; the coach's content carries its own content_locale.
            locale: "en-US",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            tz_follow_device: true,
            // The whole invitation, carried to handle_new_user().
            coach_invite_token: token,
          },
          emailRedirectTo: `${window.location.origin}/app/today`,
        },
      });
      if (error) throw error;
      if (data.user && !data.session) {
        // Email confirmation is on. The link is ALREADY attached: the trigger
        // ran when the auth user was inserted, not when the mailbox is opened.
        setPhase({ kind: "check_email", coachName });
        return;
      }
      setPhase({ kind: "accepted", coachName });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // THE DEFECT THIS CATCHES: a client the coach already had submits this
      // form with the address they already use. Supabase refuses, and the old
      // code printed its raw message under the button — so the visitor clicked
      // "Accept invitation", saw a technical line, and left believing they had
      // joined while the invitation stayed `pending`. Observed in the wild.
      if (isAlreadyRegistered(message)) {
        setPhase({ kind: "existing_account" });
        return;
      }
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------

  if (phase.kind === "loading" || authLoading) {
    return <Frame><p className="text-sm text-gray-500">Checking this invitation...</p></Frame>;
  }

  if (phase.kind === "no_token") {
    return (
      <Frame>
        <h1 className="text-xl font-semibold text-gray-900">This link is incomplete</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          An invitation link carries a token. Open the link from your coach's email
          again, in full.
        </p>
      </Frame>
    );
  }

  // Already used AND signed in: this is someone who joined and re-opened their
  // link, not a failure. Showing them "this invitation cannot be used" reads as
  // a broken account to the one person we just onboarded — the same false
  // negative the /auth redirect used to produce at the moment of success.
  if (phase.kind === "refused" && phase.reason === "already_accepted" && user) {
    return (
      <Frame>
        <h1 className="text-xl font-semibold text-gray-900">
          {t("invite.already_in_title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {t("invite.already_in_body")}
        </p>
        <Button
          variant="primary"
          className="mt-6"
          onClick={() => {
            clearStoredCoachInviteToken();
            navigate("/app/today");
          }}
        >
          {t("invite.already_in_cta")}
        </Button>
      </Frame>
    );
  }

  if (phase.kind === "refused") {
    return (
      <Frame>
        <h1 className="text-xl font-semibold text-gray-900">
          This invitation cannot be used
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">{phase.message}</p>
        <p className="mt-6 text-sm">
          <Link to="/auth" className="underline">
            Sign in to an existing account
          </Link>
        </p>
      </Frame>
    );
  }

  if (phase.kind === "accepting") {
    return <Frame><p className="text-sm text-gray-500">Joining...</p></Frame>;
  }

  if (phase.kind === "accepted") {
    return (
      <Frame>
        <h1 className="text-xl font-semibold text-gray-900">
          You are in{phase.coachName ? `, with ${phase.coachName}` : ""}.
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Your coach writes the plan. It appears in your space the moment they publish
          it — nothing is generated for you in the meantime.
        </p>
        <Button
          variant="primary"
          className="mt-6"
          onClick={() => navigate("/app/today")}
        >
          Go to my space
        </Button>
      </Frame>
    );
  }

  if (phase.kind === "existing_account") {
    return (
      <Frame>
        <h1 className="text-xl font-semibold text-gray-900">
          {t("invite.existing_account_title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {t("invite.existing_account_body")}
        </p>
        {/* The token is already in storage, so signing in ANYWHERE applies it.
            The redirect is kept as the shortest path, not as the mechanism. */}
        <Button
          variant="primary"
          className="mt-6"
          onClick={() =>
            navigate(
              `/auth?redirect=${encodeURIComponent(`/join?token=${token ?? ""}`)}`,
            )}
        >
          {t("invite.existing_account_cta")}
        </Button>
      </Frame>
    );
  }

  if (phase.kind === "check_email") {
    return (
      <Frame>
        <h1 className="text-xl font-semibold text-gray-900">Confirm your email</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Your account is created and you are already attached to
          {phase.coachName ? ` ${phase.coachName}'s` : " your coach's"} program. Open
          the confirmation email we just sent to finish signing in.
        </p>
      </Frame>
    );
  }

  // phase.kind === "ready"
  return (
    <Frame>
      <h1 className="text-xl font-semibold text-gray-900">{headline(phase.coachName)}</h1>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        Your coach writes the protocol; this space runs it. You will see what to do
        today, log what actually happened, and read how the week went — from your own
        records, never from a guess.
      </p>

      {user
        ? (
          <div className="mt-6">
            <p className="text-sm text-gray-600">
              Signed in as {user.email}. Accepting gives{" "}
              {phase.coachName ?? "your coach"} read access to your plan, your logs and
              your weekly reviews — never to what you write in chat, and never the
              ability to act as you. You can revoke it at any time from your account.
            </p>
            <Button variant="primary" className="mt-4" onClick={accept}>
              {t("invite.accept_button")}
            </Button>
          </div>
        )
        : (
          <form onSubmit={signUp} className="mt-6 space-y-3">
            <Field label="Your name" htmlFor="join-name">
              <input
                id="join-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Email" htmlFor="join-email">
              <input
                id="join-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Password" htmlFor="join-password">
              <input
                id="join-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </Field>

            {formError && <p className="text-sm text-rose-700">{formError}</p>}

            <Button
              type="submit"
              variant="primary"
              disabled={submitting}
              className="w-full"
            >
              {submitting ? "Creating your space..." : t("invite.accept_button")}
            </Button>

            <p className="text-sm text-gray-500">
              Already have an account?{" "}
              <Link
                to={`/auth?redirect=${encodeURIComponent(
                  `/join?token=${token ?? ""}`,
                )}`}
                className="underline"
              >
                Sign in and accept from there
              </Link>
              .
            </p>
          </form>
        )}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <PublicHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
        <Card className="p-6">{children}</Card>
      </main>
      <PublicFooter />
    </div>
  );
}
