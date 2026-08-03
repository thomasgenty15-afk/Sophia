import React from "react";
import { supabase } from "../../lib/supabase";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Card, SectionLabel } from "../components/ui/Card";

/**
 * PIVOT C5 — `/coach/weekly` : Monday morning.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCREEN EXISTS
 * ---------------------------------------------------------------------------
 * `coach-synthesis-v1` has been writing a row into `coach_syntheses` every
 * Monday at 06:00 UTC. `delivered_at` stayed null, and no screen in the app
 * referenced the table. The synthesis existed only in the database — nobody
 * ever read it. A weekly report nobody sees is a cron job burning tokens.
 *
 * ---------------------------------------------------------------------------
 * THE ORDER OF THE PAGE IS THE ARGUMENT
 * ---------------------------------------------------------------------------
 * 1. HOW THE WEEK FELT, first and in prose. In a 1:N masterclass the coach
 *    cannot read twenty dashboards; they need the one sentence that says where
 *    to look. Livability leads because it is the thing adherence cannot show:
 *    a student can log every day and be falling apart.
 * 2. WHO TO REACH, second, as a short list with the reason attached. A flag
 *    without its reason is an accusation.
 * 3. THE NUMBERS, last and small. They support the sentence; they are not it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SCREEN NEVER DOES
 * ---------------------------------------------------------------------------
 * It never ranks students, and it never shows a leaderboard. The flags are
 * "who needs you", not "who is failing" — and the difference is the whole
 * product. A coach who opens this and sees a ranking will start coaching the
 * ranking.
 */

interface FlaggedStudent {
  student_user_id: string;
  reason_code: string;
  risk_band: string | null;
  contact_state: string | null;
  evidence: Record<string, unknown> | null;
}

interface SynthesisRow {
  id: string;
  period_start: string;
  period_end: string;
  narrative: string | null;
  metrics: Record<string, unknown> | null;
  flagged_students: FlaggedStudent[] | null;
  generated_at: string;
  delivered_at: string | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

/** Reason codes, in the coach's words. R7: an unknown code is shown raw. */
const REASON_COPY: Record<string, string> = {
  silent_contact: "Has not written in a while",
  slipping_contact: "Going quiet",
  hard_week: "Reported a hard week",
  low_coverage: "Barely logged anything",
  no_evaluable_plan: "Nothing to measure against yet",
  restriction_flag: "Restriction signals — handle directly",
};

const CONTACT_TONE: Record<string, BadgeTone> = {
  responsive: "positive" as BadgeTone,
  slipping: "caution" as BadgeTone,
  silent: "critical" as BadgeTone,
};

function shortId(id: string): string {
  return id.slice(0, 8);
}

export default function CoachWeeklyPage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [rows, setRows] = React.useState<SynthesisRow[]>([]);
  const [selected, setSelected] = React.useState<number>(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("coach_syntheses")
          .select(
            "id, period_start, period_end, narrative, metrics, flagged_students, generated_at, delivered_at",
          )
          .order("period_start", { ascending: false })
          .limit(12);
        if (error) throw new Error(error.message);
        if (cancelled) return;
        setRows((data ?? []) as SynthesisRow[]);
        setState({ kind: "ready" });
      } catch (err) {
        if (!cancelled) {
          setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const current = rows[selected] ?? null;

  // Marking delivery goes through a SECURITY DEFINER function, never a plain
  // UPDATE: RLS cannot restrict columns, so an update policy would also let a
  // coach rewrite the narrative — editing a report about their own students.
  React.useEffect(() => {
    if (!current || current.delivered_at) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("keel_mark_synthesis_delivered", {
        p_synthesis_id: current.id,
        p_channel: "in_app",
      });
      // A failure here must not break the read. Seeing the synthesis is the
      // point; recording that it was seen is bookkeeping.
      if (error || cancelled || !data) return;
      setRows((prev) =>
        prev.map((r) => (r.id === current.id ? { ...r, delivered_at: String(data) } : r))
      );
    })();
    return () => { cancelled = true; };
  }, [current]);

  if (state.kind === "loading") {
    return (
      <KeelAppShell variant="coach" title="This week">
        <p className="text-sm text-gray-500">Loading…</p>
      </KeelAppShell>
    );
  }
  if (state.kind === "error") {
    return (
      <KeelAppShell variant="coach" title="This week">
        <Card tone="warning">
          <p className="text-sm text-gray-900">We could not load your weekly read.</p>
          <p className="mt-1 text-xs text-gray-600">{state.message}</p>
        </Card>
      </KeelAppShell>
    );
  }
  if (!current) {
    return (
      <KeelAppShell variant="coach" title="This week">
        <Card>
          <p className="text-sm leading-6 text-gray-800">
            No weekly read yet. The first one is written the Monday after your
            students start logging.
          </p>
        </Card>
      </KeelAppShell>
    );
  }

  const flagged = current.flagged_students ?? [];
  const metrics = current.metrics ?? {};

  return (
    <KeelAppShell variant="coach" title="This week">
      <div className="space-y-6">
        {rows.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {rows.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(i)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  i === selected
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-700 ring-1 ring-gray-200"
                }`}
              >
                {r.period_start}
              </button>
            ))}
          </div>
        ) : null}

        {/* 1. HOW THE WEEK FELT — prose first. */}
        <Card>
          <SectionLabel>
            Week of {current.period_start} → {current.period_end}
          </SectionLabel>
          {current.narrative ? (
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-800">
              {current.narrative}
            </p>
          ) : (
            <p className="mt-3 text-sm text-gray-600">
              Nothing to report for this week.
            </p>
          )}
        </Card>

        {/* 2. WHO TO REACH — with the reason attached, always. */}
        <Card>
          <SectionLabel>Worth a message</SectionLabel>
          {flagged.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              Nobody stands out this week.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {flagged.map((f) => (
                <li
                  key={f.student_user_id}
                  className="flex flex-wrap items-center gap-2 border-l-2 border-gray-200 pl-4"
                >
                  <span className="font-mono text-xs text-gray-500">
                    {shortId(f.student_user_id)}
                  </span>
                  <span className="text-sm text-gray-900">
                    {REASON_COPY[f.reason_code] ?? f.reason_code}
                  </span>
                  {f.contact_state ? (
                    <Badge tone={CONTACT_TONE[f.contact_state] ?? ("neutral" as BadgeTone)}>
                      {f.contact_state}
                    </Badge>
                  ) : null}
                  {/*
                    Shown explicitly rather than hidden: "we could not measure"
                    and "they scored badly" look identical when a number is
                    simply absent, and a coach acting on the wrong one of those
                    two will say the wrong thing.
                  */}
                  {f.evidence?.adherence_gated ? (
                    <span className="text-xs text-gray-500">no number to show</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 3. THE NUMBERS — last, and small. */}
        <Card>
          <SectionLabel>The numbers</SectionLabel>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {Object.entries(metrics).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-gray-500">{k.replace(/_/g, " ")}</dt>
                <dd className="text-gray-900">
                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-gray-400">
            Written {new Date(current.generated_at).toLocaleString()}
            {current.delivered_at ? " · read" : ""}
          </p>
        </Card>
      </div>
    </KeelAppShell>
  );
}
