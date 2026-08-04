import React from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { InviteDialog } from "../components/InviteDialog";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button, ButtonLink } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { t } from "../i18n/t";
import {
  CONTACT_LABEL,
  type ContactState,
  contactStateFor,
  countActiveSeats,
  countPendingInvitations,
} from "../api/coachCohort";

/**
 * KEEL W6.1 — `/coach`: the coach's home. Who they follow, and how many seats
 * that costs.
 *
 * ---------------------------------------------------------------------------
 * TWO SOURCES, ON PURPOSE (the W1 tenancy split)
 * ---------------------------------------------------------------------------
 *   `coach_clients`             — Tier A. The LINK: status, seat state, dates.
 *                                 Structural columns, no student prose, so a
 *                                 plain SELECT policy is enough.
 *   `coach_student_directory`   — Tier B. The student's IDENTITY (full_name,
 *                                 avatar, timezone, locale).
 *
 * Why not just select `profiles`? Because PostgREST grants are per-ROLE and the
 * coach and the student are both `authenticated`: a policy cannot hide a column
 * from one and not the other. `coach_student_directory` is a SECURITY DEFINER
 * view with a column allowlist — it is structurally incapable of returning
 * email, phone_number, birth_date or any billing column. Reading `profiles`
 * here would hand the coach exactly those.
 *
 * ---------------------------------------------------------------------------
 * THE SEAT COUNTER IS THE INVOICE
 * ---------------------------------------------------------------------------
 * `coach_clients.status='active'` is the billable seat (SCHEMA, TENANCY). It is
 * counted from the rows on screen, never from a stored counter — same doctrine
 * as the rest of KEEL: zero incremental counters, derived state recomputed from
 * the rows. `invited`, `paused` and `ended` links appear in the list and are
 * NOT counted, so what the coach sees and what they are billed for cannot
 * diverge.
 *
 * FAIL LOUD, SHOW NOTHING. A failed read renders the error state, never an
 * empty list: "you have no students" and "we could not read your students" are
 * different sentences, and showing the first for the second is how a coach
 * concludes their client lost access.
 */

interface CoachClientRow {
  id: string;
  student_user_id: string | null;
  invited_email: string | null;
  status: "invited" | "active" | "paused" | "ended";
  seat_state: "billed" | "trial" | "free";
  started_at: string | null;
  consent_granted_at: string | null;
  created_at: string;
}

interface DirectoryRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
  locale: string | null;
}

interface ContactRow {
  student_user_id: string;
  last_inbound_at: string | null;
  inbound_count_7d: number;
}

interface CoachHomeData {
  clients: CoachClientRow[];
  directory: Map<string, DirectoryRow>;
  contact: Map<string, ContactRow>;
}

const CONTACT_TONE: Record<ContactState, BadgeTone> = {
  responsive: "positive",
  slipping: "caution",
  silent: "critical",
};



type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: CoachHomeData }
  | { kind: "error" };

async function loadCoachHome(coachUserId: string): Promise<CoachHomeData> {
  // The coaches row id is what `coach_clients.coach_id` points at; the RLS
  // policy already scopes the select to this coach, so no filter is needed and
  // none is added (a filter that duplicates a policy is a filter that can drift
  // from it).
  void coachUserId;

  const [clientsRes, directoryRes, contactRes] = await Promise.all([
    supabase
      .from("coach_clients")
      .select(
        "id, student_user_id, invited_email, status, seat_state, started_at, " +
          "consent_granted_at, created_at",
      )
      .order("created_at", { ascending: true }),
    supabase
      .from("coach_student_directory")
      .select("id, full_name, avatar_url, timezone, locale"),
    // PIVOT §1.4 — WHEN the student last spoke, never WHAT they said. Tier B
    // view: `chat_messages` has no coach policy at all, and that is deliberate
    // (the conversation log is the student's private journal, §1.5).
    supabase
      .from("coach_student_contact")
      .select("student_user_id, last_inbound_at, inbound_count_7d"),
  ]);

  if (clientsRes.error) {
    throw new Error(`[keel/coach] coach_clients failed: ${clientsRes.error.message}`);
  }
  if (directoryRes.error) {
    throw new Error(
      `[keel/coach] coach_student_directory failed: ${directoryRes.error.message}`,
    );
  }

  // A contact read that fails degrades the BADGE, never the screen: knowing
  // who is on the roster matters more than knowing who went quiet, and a coach
  // staring at an error page learns neither.
  const contact = new Map<string, ContactRow>();
  if (!contactRes.error) {
    for (const row of (contactRes.data ?? []) as unknown as ContactRow[]) {
      contact.set(row.student_user_id, row);
    }
  } else {
    console.warn("[keel/coach] coach_student_contact failed", contactRes.error);
  }

  const directory = new Map<string, DirectoryRow>();
  for (const row of (directoryRes.data ?? []) as unknown as DirectoryRow[]) {
    directory.set(row.id, row);
  }
  return {
    clients: (clientsRes.data ?? []) as unknown as CoachClientRow[],
    directory,
    contact,
  };
}

export function CoachHomePage() {
  const { user } = useAuth();
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = React.useState(0);

  const userId = user?.id ?? null;

  React.useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    setState({ kind: "loading" });
    loadCoachHome(userId)
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  return (
    <KeelAppShell
      variant="coach"
      title={t("coach.home.title")}
      subtitle={t("coach.home.subtitle")}
    >
      {state.kind === "loading" && (
        <p className="text-sm text-gray-500">{t("coach.guard.checking")}</p>
      )}

      {state.kind === "error" && (
        <Card tone="warning">
          <p className="text-sm text-amber-900">{t("coach.home.load_error")}</p>
          <Button
            className="mt-3 border-amber-300 text-amber-900 hover:bg-amber-100"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            {t("coach.home.retry")}
          </Button>
        </Card>
      )}

      {state.kind === "ready" && (
        <CoachHomeBody
          data={state.data}
          onInvited={() => setReloadKey((k) => k + 1)}
        />
      )}
    </KeelAppShell>
  );
}

function CoachHomeBody({
  data,
  onInvited,
}: {
  data: CoachHomeData;
  onInvited: () => void;
}) {
  const activeSeats = countActiveSeats(data.clients);
  const pending = countPendingInvitations(data.clients);
  // W6.5 — the dialog exists; this is its only entry point. A component with no
  // caller is not a feature (the W4.7 lesson), so the state lives here.
  const [inviteOpen, setInviteOpen] = React.useState(false);

  if (data.clients.length === 0) {
    return (
      <EmptyState
        inviteOpen={inviteOpen}
        setInviteOpen={setInviteOpen}
        onInvited={onInvited}
      />
    );
  }

  return (
    <>
      <section className="mb-8 grid grid-cols-2 gap-3">
        <StatTile
          label={t("coach.home.seats_label")}
          value={String(activeSeats)}
          hint={t("coach.home.seats_hint")}
        />
        <StatTile label={t("coach.home.pending_label")} value={String(pending)} />
      </section>

      <section>
        <SectionLabel>{t("coach.home.list_title")}</SectionLabel>
        <Card padded={false}>
          <ul className="divide-y divide-gray-200">
            {data.clients.map((client) => (
              <StudentRow
                key={client.id}
                client={client}
                directory={client.student_user_id
                  ? data.directory.get(client.student_user_id) ?? null
                  : null}
                contact={client.student_user_id
                  ? data.contact.get(client.student_user_id) ?? null
                  : null}
              />
            ))}
          </ul>
        </Card>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink to="/coach/import" variant="primary">
          {t("coach.home.import_cta")}
        </ButtonLink>
        <ButtonLink to="/coach/templates">
          {t("coach.home.templates_cta")}
        </ButtonLink>
        <Button onClick={() => setInviteOpen(true)}>
          {t("coach.home.empty_cta")}
        </Button>
      </div>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={onInvited}
      />
    </>
  );
}

function EmptyState({
  inviteOpen,
  setInviteOpen,
  onInvited,
}: {
  inviteOpen: boolean;
  setInviteOpen: (open: boolean) => void;
  onInvited: () => void;
}) {
  return (
    <Card tone="dashed" className="p-8 text-center">
      <h2 className="text-lg font-semibold text-gray-900">
        {t("coach.home.empty_title")}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-600">
        {t("coach.home.empty_body")}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {/* W6.5 landed: the invitation is the first act, importing a plan the
            second. Both are reachable from here — a coach with no student and
            no way to invite one has no product. */}
        <Button variant="primary" onClick={() => setInviteOpen(true)}>
          {t("coach.home.empty_cta")}
        </Button>
        <ButtonLink to="/coach/import">
          {t("coach.home.import_cta")}
        </ButtonLink>
      </div>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={onInvited}
      />
    </Card>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold text-gray-900">{value}</div>
      {hint && <p className="mt-2 text-xs leading-5 text-gray-500">{hint}</p>}
    </Card>
  );
}

const STATUS_LABEL: Record<CoachClientRow["status"], Parameters<typeof t>[0]> = {
  invited: "coach.home.status.invited",
  active: "coach.home.status.active",
  paused: "coach.home.status.paused",
  ended: "coach.home.status.ended",
};

const SEAT_LABEL: Record<CoachClientRow["seat_state"], Parameters<typeof t>[0]> = {
  billed: "coach.home.seat.billed",
  trial: "coach.home.seat.trial",
  free: "coach.home.seat.free",
};

function StudentRow({
  client,
  directory,
  contact,
}: {
  client: CoachClientRow;
  directory: DirectoryRow | null;
  contact: ContactRow | null;
}) {
  // Name resolution order, and what each step means:
  //   directory.full_name -> ACTIVE link: `coach_student_directory` filters on
  //                          coached_student_ids(), which only returns active
  //                          consented links. So an identity is on screen if
  //                          and only if the coach currently has read access.
  //   invited_email       -> the invitation is out, nobody has accepted yet
  //   linked but hidden   -> paused or ended: the row exists (billing history,
  //                          audit) but the name is no longer readable. Saying
  //                          so is more honest than showing "Invited student"
  //                          for someone who was a client for six months.
  // We never fall back to the raw uuid: an identifier on screen reads as
  // information and is none.
  const name = directory?.full_name?.trim() ||
    client.invited_email ||
    (client.student_user_id
      ? t("coach.home.student_hidden")
      : t("coach.home.student_unnamed"));

  const secondary = client.student_user_id === null
    ? t("coach.home.no_name_yet")
    : client.started_at
    ? t("coach.home.since", { date: formatDate(client.started_at) })
    : (directory?.timezone ?? "");

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-gray-900">{name}</div>
        {secondary && (
          <div className="truncate text-xs text-gray-500">{secondary}</div>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {/* PIVOT §1.4 — shown only on a LIVE link: "silent" about a paused or
            ended student is noise, and about an invitation nobody accepted it
            would be a lie (there is nothing to be silent from yet). */}
        {client.status === "active" && (() => {
          const state = contactStateFor(contact?.last_inbound_at, new Date());
          return (
            <Badge tone={CONTACT_TONE[state]}>{CONTACT_LABEL[state]}</Badge>
          );
        })()}
        {client.status === "active" && (
          <Badge>{t(SEAT_LABEL[client.seat_state])}</Badge>
        )}
        <Badge tone={STATUS_TONE[client.status]}>
          {t(STATUS_LABEL[client.status])}
        </Badge>
        {/* W6.6 — the read-only student space. Offered ONLY on an active link:
            `coached_student_ids()` returns nothing for a paused or ended one, so
            the page would open on a refusal panel and an audit line would be
            written for an access the coach does not have. */}
        {client.status === "active" && client.student_user_id && (
          <ButtonLink to={`/coach/clients/${client.student_user_id}`} size="sm">
            {t("coach.home.open_student")}
          </ButtonLink>
        )}
      </div>
    </li>
  );
}

const STATUS_TONE: Record<CoachClientRow["status"], BadgeTone> = {
  active: "positive",
  invited: "info",
  paused: "caution",
  ended: "neutral",
};

/**
 * R3, `ui_locale`: the locale is STATED, not inherited from the browser.
 * `toLocaleDateString(undefined, ...)` reads navigator.language, which renders
 * "27 juil. 2026" inside an otherwise 100 %-English screen for anyone whose
 * browser is French — observed in the W6.1 browser run. The KEEL pilot ships
 * one UI locale (see `i18n/t.ts`: "Pilot: English only"), so that is the tag
 * passed here. When ui_locale becomes a real per-user axis, this is the single
 * place that reads it.
 */
const UI_LOCALE = "en-US";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(UI_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default CoachHomePage;
