import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import SEO from "../../components/SEO";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  clearStoredCoachInviteToken,
  storeCoachInviteToken,
} from "../api/coachInvite";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";
import { t } from "../i18n/t";

// KEEL — /join?token=... (BUILD_PLAN W6.5, rewritten as the student's front
// door on 2026-08-03)
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
// ── WHY THIS PAGE IS LONG, WHEN IT USED TO BE A FORM ─────────────────────
// A student does NOT arrive from the landing — that page sells to coaches, who
// pay. They arrive here, from their coach's email, and this is the first and
// only place they can learn what they are about to live every day for weeks.
// So the explanation comes BEFORE the form, and the form is the last thing on
// the page: they type a password knowing what they agreed to. That ordering is
// the consent, and it is the reason not to add a jump link past the content.
//
// ── THE SEES / NEVER-SEES BLOCK IS LOAD-BEARING ──────────────────────────
// Every line of it was written against the live schema, and it is the only
// part of this page that can turn into a lie by someone else's migration. The
// short version, proved line by line in docs/nutrition-pivot/STUDENT-PAGE.md:
//
//   · `chat_messages` has RLS on and NO coach policy. The only coach-facing
//     object over it, the `coach_student_contact` view, selects
//     `max(created_at)` and `count(*)`. There is no column to read text from.
//   · `coach_student_events` exposes `media_path IS NOT NULL AS has_media` and
//     neither `media_path` nor `student_note`. The `meal-photos` bucket is
//     private and `storage.objects` carries zero policies.
//   · No energy or macro column exists on `protocol_events` (CONTRACT
//     NON-INPUT #4), and `findNumericTarget` strips them out of a plan line.
//   · THE EXCEPTION IS REAL AND IS NAMED ON THE PAGE. When the restriction
//     guard raises, `router/run.ts` passes the student's own message into
//     `escalateRestrictionSignal`, which writes it to
//     `contract_change_requests.student_words` — a table the coach may SELECT.
//     Claiming "your coach never reads a word you write" would be false. The
//     page states the carve-out instead, which is what makes the rest true.
//
// I18N. All visible copy is in keel/i18n/en.ts (`join.*` plus the pre-existing
// `invite.*`). `{coach}` is always the mid-sentence form — the caller passes
// the first name or "your coach", so no key may open a sentence with it.

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

/** Mid-sentence form of the coach, for every `join.*` key. Never sentence-initial. */
function coachRef(coachName: string | null): string {
  return coachName ?? "your coach";
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
          // Même raison que le CTA d'acceptation: l'élève qui confirme son
          // email arrive pour la PREMIÈRE fois. On l'emmène dans la
          // conversation, pas sur un écran du jour encore vide.
          emailRedirectTo: `${window.location.origin}/app/chat`,
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
  // The compact states. Someone who has just joined, or who is holding a link
  // the server refused, needs an answer and an exit — not a welcome tour.
  // -------------------------------------------------------------------------

  if (phase.kind === "loading" || authLoading) {
    return <Notice><p className="text-sm text-gray-500">Checking this invitation...</p></Notice>;
  }

  if (phase.kind === "accepting") {
    return <Notice><p className="text-sm text-gray-500">Joining...</p></Notice>;
  }

  // Already used AND signed in: this is someone who joined and re-opened their
  // link, not a failure. Showing them "this invitation cannot be used" reads as
  // a broken account to the one person we just onboarded — the same false
  // negative the /auth redirect used to produce at the moment of success.
  if (phase.kind === "refused" && phase.reason === "already_accepted" && user) {
    return (
      <Notice>
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
      </Notice>
    );
  }

  if (phase.kind === "accepted") {
    return (
      <Notice>
        <h1 className="text-xl font-semibold text-gray-900">
          {phase.coachName
            ? t("join.accepted.title_with_coach", { coach: phase.coachName })
            : t("join.accepted.title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">{t("join.accepted.body")}</p>
        <Button
          variant="primary"
          className="mt-6"
          // La conversation, pas l'écran du jour. Un élève qui vient d'accepter
          // n'a encore RIEN sur son Today — ni plan adopté, ni suivi — et son
          // tout premier écran serait vide. La bulle, elle, lui dit quoi faire
          // (« Say hello, or send a photo of your next meal »), et c'est là que
          // le produit se passe. Aucune ligne du dépôt ne menait au chat avant
          // celle-ci: on expliquait à l'élève où aller au lieu de l'y emmener.
          onClick={() => navigate("/app/chat")}
        >
          {t("join.accepted.cta")}
        </Button>
      </Notice>
    );
  }

  if (phase.kind === "existing_account") {
    return (
      <Notice>
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
      </Notice>
    );
  }

  if (phase.kind === "check_email") {
    return (
      <Notice>
        <h1 className="text-xl font-semibold text-gray-900">Confirm your email</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Your account is created and you are already attached to
          {phase.coachName ? ` ${phase.coachName}'s` : " your coach's"} program. Open
          the confirmation email we just sent to finish signing in.
        </p>
      </Notice>
    );
  }

  // -------------------------------------------------------------------------
  // The two full surfaces. Both explain the product; they differ only in what
  // the reader can DO about it.
  // -------------------------------------------------------------------------

  // A refused link is not a dead end: the person still wants this, and the one
  // useful thing we can do is tell them what they are chasing their coach for.
  if (phase.kind === "refused") {
    return (
      <Welcome>
        <Opening title={t("join.refused.title")} body={phase.message}>
          <p className="mt-6 text-base">
            <Link to="/auth" className="font-medium text-gray-900 underline">
              {t("join.refused.signin_cta")}
            </Link>
          </p>
        </Opening>
        <Explanation coach={null} />
      </Welcome>
    );
  }

  if (phase.kind === "no_token") {
    return (
      <Welcome>
        <Opening
          title={t("join.no_token.title")}
          body={t("join.no_token.body")}
        >
          <p className="mt-6 text-base leading-7 text-gray-600">
            {t("join.no_token.have_account")}{" "}
            <Link to="/auth" className="font-medium text-gray-900 underline">
              {t("join.no_token.have_account_cta")}
            </Link>
          </p>
        </Opening>
        <Explanation coach={null} label={t("join.no_token.what_is_this")} />
      </Welcome>
    );
  }

  // phase.kind === "ready"
  const coach = coachRef(phase.coachName);
  return (
    <Welcome>
      <Opening title={headline(phase.coachName)} body={t("join.lead", { coach })}>
        {!user && (
          <p className="mt-6 text-sm leading-6 text-gray-500">
            {t("join.lead_form_note")}
          </p>
        )}
      </Opening>

      <Explanation coach={phase.coachName} />

      <Band>
        {user
          ? (
            <>
              <h2 className="text-2xl font-semibold leading-tight tracking-tight text-gray-900">
                {t("join.form.title")}
              </h2>
              <Card className="mt-6 sm:p-6">
                <p className="text-base leading-7 text-gray-900">
                  {t("join.form.signed_in_as", { email: user.email ?? "" })}
                </p>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  {t("join.form.signed_in_body", { coach })}
                </p>
                <Button variant="primary" className="mt-5 w-full sm:w-auto" onClick={accept}>
                  {t("invite.accept_button")}
                </Button>
              </Card>
            </>
          )
          : (
            <>
              <h2 className="text-2xl font-semibold leading-tight tracking-tight text-gray-900">
                {t("join.form.title")}
              </h2>
              <p className="mt-3 text-base leading-7 text-gray-600">
                {t("join.form.lead", { coach })}
              </p>
              <Card className="mt-6 sm:p-6">
                <form onSubmit={signUp} className="space-y-4">
                  <Field label={t("join.form.name")} htmlFor="join-name">
                    <input
                      id="join-name"
                      type="text"
                      required
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t("join.form.email")} htmlFor="join-email">
                    <input
                      id="join-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field
                    label={t("join.form.password")}
                    htmlFor="join-password"
                    hint={t("join.form.password_hint")}
                  >
                    <input
                      id="join-password"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
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
                    {submitting ? t("join.form.submitting") : t("invite.accept_button")}
                  </Button>

                  <p className="text-sm leading-6 text-gray-500">
                    {t("join.form.have_account")}{" "}
                    <Link
                      to={`/auth?redirect=${encodeURIComponent(
                        `/join?token=${token ?? ""}`,
                      )}`}
                      className="font-medium text-gray-900 underline"
                    >
                      {t("join.form.have_account_cta")}
                    </Link>
                    .
                  </p>
                </form>
              </Card>
            </>
          )}
      </Band>
    </Welcome>
  );
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

/**
 * The compact frame, unchanged in spirit from W6.5: a single card for the
 * states that are an ANSWER (you are in / confirm your email / joining). The
 * header drops the coach trial — see PublicHeader.
 */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JoinSEO />
      <PublicHeader audience="student" />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
        <Card className="p-6">{children}</Card>
      </main>
      <PublicFooter />
    </div>
  );
}

/**
 * The full page. One column at every width: a student opens this link on their
 * phone, and a two-column layout that only exists above 1024px is a layout
 * written for the reviewer rather than the reader. Sections are separated by
 * hairline rules — the landing's device — never by alternating tints, so the
 * two ground changes that DO happen (the dark block, nothing else) each mean
 * something.
 */
function Welcome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JoinSEO />
      <PublicHeader audience="student" />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

/**
 * NOINDEX, and not as a precaution: every real URL of this route carries an
 * invitation token in the query string, and an indexed one is a live invitation
 * in a search result. No `canonical` either, for the same reason.
 *
 * It also repairs a smaller thing that only a student ever saw: /join had no
 * <SEO> at all, so the tab of the one page written for them was still wearing
 * the legacy French title of index.html.
 */
function JoinSEO() {
  return (
    <SEO
      title={t("join.seo_title")}
      description={t("join.seo_description")}
      robots="noindex,nofollow"
      lang="en"
    />
  );
}

/** The prose column: ~65 characters at body size, which is where reading is. */
function Column({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-xl px-5 ${className}`}>{children}</div>;
}

/** A white section, ruled off from the one above it. */
function Band({ children }: { children: React.ReactNode }) {
  return (
    <section className="border-t border-gray-200">
      <Column className="py-12 sm:py-16">{children}</Column>
    </section>
  );
}

function Eyebrow({ children, tone = "light" }: { children: React.ReactNode; tone?: "light" | "dark" }) {
  return (
    <p
      className={`text-xs font-semibold uppercase tracking-widest ${
        tone === "dark" ? "text-gray-400" : "text-gray-500"
      }`}
    >
      {children}
    </p>
  );
}

/**
 * The top of the page, whichever surface this is. The title is the situation
 * the reader is in — invited, refused, or link-less — and it is the only h1.
 */
function Opening({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <Column className="pb-12 pt-12 sm:pb-16 sm:pt-20">
        <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight text-gray-900 text-balance sm:text-4xl">
          {title}
        </h1>
        <p className="mt-6 text-lg leading-8 text-gray-600">{body}</p>
        {children}
      </Column>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The explanation — identical on every surface that shows it
// ---------------------------------------------------------------------------

/**
 * Three sections, in the order a person actually asks the questions: what will
 * my days look like, what is this going to do to me, and who is watching.
 *
 * `coach` is the raw first name (or null): every string interpolates the
 * mid-sentence form, so a page with no token still reads as English.
 */
function Explanation({ coach, label }: { coach: string | null; label?: string }) {
  const c = coachRef(coach);
  return (
    <>
      <Band>
        {label ? <Eyebrow>{label}</Eyebrow> : null}
        <h2
          className={`text-2xl font-semibold leading-tight tracking-tight text-gray-900 text-balance ${
            label ? "mt-2" : ""
          }`}
        >
          {t("join.day.title")}
        </h2>

        <div className="mt-10 space-y-10">
          <Moment
            where={t("join.day.where_chat")}
            title={t("join.day.photo_title")}
            body={t("join.day.photo_body", { coach: c })}
          />
          <Moment
            where={t("join.day.where_chat")}
            title={t("join.day.evening_title")}
            body={t("join.day.evening_body")}
          >
            {/*
              The three taps, literally. Three answers and not a 0-10 scale
              (`_shared/keel/daily_pulse.ts`): the cap came from WhatsApp
              originally, and it SURVIVES the move in-app because it was the
              right shape anyway — a tired student at 8pm answers three buttons,
              not a slider. The tones are the ones /app/progress already renders
              these three states in, so the student meets the same colours twice.
            */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="positive">{t("join.day.tap_good")}</Badge>
              <Badge tone="caution">{t("join.day.tap_mixed")}</Badge>
              <Badge tone="critical">{t("join.day.tap_hard")}</Badge>
            </div>
          </Moment>
          <Moment
            where={t("join.day.where_app")}
            title={t("join.day.app_title")}
            body={t("join.day.app_body", { coach: c })}
          />
        </div>
      </Band>

      <NobodyGrades />
      <Ledger coach={c} />

      {/*
        The limit, and the last thing read before a password is typed on the
        surface that has a form. There is no one-to-one channel back to the
        coach, and a page that lets someone hope for one has mis-sold the
        product on the day they joined. It closes the explanation on every
        surface, not just the one with a form — an expired link should not be
        the reason someone finds this out three weeks later.
      */}
      <Band>
        <h2 className="text-2xl font-semibold leading-tight tracking-tight text-gray-900 text-balance">
          {t("join.limit.title", { coach: c })}
        </h2>
        <p className="mt-4 text-base leading-7 text-gray-600">{t("join.limit.body")}</p>
      </Band>
    </>
  );
}

/**
 * One moment of the day. The eyebrow is the SURFACE, not a number: "on
 * chat" twice and "in this app" once is a true statement about where this
 * product lives, and 01/02/03 would only have said there are three of them.
 */
function Moment({
  where,
  title,
  body,
  children,
}: {
  where: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <Eyebrow>{where}</Eyebrow>
      <h3 className="mt-2 text-lg font-medium leading-7 text-gray-900 text-balance">
        {title}
      </h3>
      <p className="mt-2 text-base leading-7 text-gray-600">{body}</p>
      {children}
    </div>
  );
}

/**
 * The page's one dark ground. The landing spends its dark block on the double
 * lock, because that is the argument a coach buys; this page spends it on the
 * absence of a grade, because that is the one a student stays for. Full-bleed
 * so the change of ground reads as a change of register rather than as a card.
 *
 * No accent hue is introduced here — as on the landing, every saturated colour
 * in this product is a STATE, and a brand tint on the one page whose argument
 * is "nothing here is scoring you" would be decoration pretending to mean
 * something.
 */
function NobodyGrades() {
  return (
    <section className="bg-gray-950 text-white">
      <Column className="py-14 sm:py-20">
        <Eyebrow tone="dark">{t("join.grade.kicker")}</Eyebrow>
        <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-3xl">
          {t("join.grade.title")}
        </h2>
        <p className="mt-4 text-base leading-7 text-gray-300">{t("join.grade.lead")}</p>

        <dl className="mt-10 grid gap-8">
          <Refusal title={t("join.grade.one_title")}>{t("join.grade.one_body")}</Refusal>
          <Refusal title={t("join.grade.two_title")}>{t("join.grade.two_body")}</Refusal>
          <Refusal title={t("join.grade.three_title")}>{t("join.grade.three_body")}</Refusal>
        </dl>
      </Column>
    </section>
  );
}

function Refusal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-gray-700 pl-5">
      <dt className="text-lg font-medium leading-7 text-white text-balance">{title}</dt>
      <dd className="mt-2 text-base leading-7 text-gray-400">{children}</dd>
    </div>
  );
}

/**
 * The ledger — the one designed object on this page, and the only block that
 * required reading the database rather than the product brief.
 *
 * It is one container with a seam through it, because the seam IS the thing
 * being described. The two halves are told apart by ground and by label, not
 * by icons or ticks-and-crosses: a green tick against "what crosses over"
 * would be scoring the list, on the page that just promised not to score
 * anything.
 *
 * The exception sits inside the same container, under a heavy rule rather than
 * a warning tint. It is not an alarm — it is the one place the boundary is
 * crossed on purpose, and burying it in amber would be editorialising a fact.
 */
function Ledger({ coach }: { coach: string }) {
  return (
    <Band>
      <Eyebrow>{t("join.seen.kicker")}</Eyebrow>
      <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-gray-900 text-balance">
        {t("join.seen.title", { coach })}
      </h2>
      <p className="mt-4 text-base leading-7 text-gray-600">{t("join.seen.lead")}</p>

      <Card padded={false} className="mt-8">
        <div className="px-5 py-5 sm:px-6">
          <Eyebrow>{t("join.seen.sees_label")}</Eyebrow>
          <ul className="mt-3 space-y-3">
            <LedgerLine>{t("join.seen.sees_1")}</LedgerLine>
            <LedgerLine>{t("join.seen.sees_2")}</LedgerLine>
            <LedgerLine>{t("join.seen.sees_3")}</LedgerLine>
            <LedgerLine>{t("join.seen.sees_4")}</LedgerLine>
            <LedgerLine>{t("join.seen.sees_5")}</LedgerLine>
          </ul>
        </div>

        <div className="border-t border-gray-200 bg-gray-50 px-5 py-5 sm:px-6">
          <Eyebrow>{t("join.seen.never_label")}</Eyebrow>
          <ul className="mt-3 space-y-3">
            <LedgerLine>{t("join.seen.never_1")}</LedgerLine>
            <LedgerLine>{t("join.seen.never_2")}</LedgerLine>
            <LedgerLine>{t("join.seen.never_3")}</LedgerLine>
            <LedgerLine>{t("join.seen.never_4")}</LedgerLine>
          </ul>
        </div>

        <div className="border-t-2 border-gray-900 px-5 py-5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-900">
            {t("join.seen.exception_label")}
          </p>
          <p className="mt-3 text-base leading-7 text-gray-700">
            {t("join.seen.exception_body", { coach })}
          </p>
        </div>
      </Card>
    </Band>
  );
}

function LedgerLine({ children }: { children: React.ReactNode }) {
  return <li className="text-base leading-7 text-gray-700">{children}</li>;
}
