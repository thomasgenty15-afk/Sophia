import React from "react";
import { supabase } from "../../lib/supabase";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";

/**
 * PIVOT C1 — `/app/plan` : the week, and whose week it is.
 *
 * ---------------------------------------------------------------------------
 * THE MODEL, because the whole screen follows from it
 * ---------------------------------------------------------------------------
 *     THE COACH TEACHES A METHOD · THE STUDENT DECIDES · NOBODY GRADES
 *
 * So this screen never shows a score, a completion percentage, a streak or a
 * badge. It shows what the student set for themselves, and where each line came
 * from. Nothing here measures performance — that is what lets Sophia follow
 * "from a long way off" without creating resistance.
 *
 * ---------------------------------------------------------------------------
 * GENERATING IS NOT ADOPTING
 * ---------------------------------------------------------------------------
 * Generation produces a DRAFT. The student reads it and adopts it if they
 * recognise themselves in it. A plan applied automatically would be the
 * machine's plan carried by the student — the opposite of what we are building.
 *
 * ---------------------------------------------------------------------------
 * EVERY FOOD LINE SHOWS THE CONVICTION IT CAME FROM
 * ---------------------------------------------------------------------------
 * This changed with C1, and the reason matters. The coach does NOT write
 * per-student lines — they teach a method, and Sophia composes the lines from
 * it. So a badge reading "written by your coach" would be a lie.
 *
 * What is true, and what we show, is the derivation: the line, then the
 * coach's actual conviction underneath it. The code can guarantee that every
 * line NAMES a real conviction; it cannot guarantee the interpretation is
 * faithful. Showing the conviction is what makes that judgeable — by the
 * student, and by the coach reading over their shoulder.
 */

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-week-plan-v1`;

interface PlanItem {
  kind: "nutrition" | "action";
  label: string;
  rationale: string;
  source_belief_key: string | null;
  source_belief_claim: string | null;
  action_kind: string | null;
  days: string[];
}

interface WeekPlanRow {
  id: string;
  week_start: string;
  items: PlanItem[];
  status: "draft" | "adopted" | "archived";
  adopted_at: string | null;
}

interface GoalRow {
  goal: string;
  situation: string | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
};

const GOALS: Array<{ value: string; label: string }> = [
  { value: "fat_loss", label: "Lose fat" },
  { value: "recomposition", label: "Recomposition" },
  { value: "performance", label: "Performance" },
  { value: "health", label: "Health" },
  { value: "maintenance", label: "Maintain" },
];

/**
 * Server error codes, in the student's words.
 *
 * Kept as a map rather than shown raw: `coach_has_no_doctrine` on screen tells
 * a student nothing, and each of these calls for a different next move. An
 * unknown code still falls through to the raw string — a silent generic message
 * would hide a fault we need to see.
 */
const ERROR_COPY: Record<string, string> = {
  goal_required: "Set your goal above first — the week is built around it.",
  no_coach: "You are not linked to a coach yet.",
  coach_has_no_doctrine:
    "Your coach has not published their method yet. Nothing can be built from it until they do.",
  empty_plan:
    "Nothing usable came back. Nothing was saved — try again, and tell us if it keeps happening.",
  model_returned_tool_call: "Something went wrong on our side. Nothing was saved.",
  // Reached only if the confirmation below was somehow bypassed: the server
  // holds this line for every client, not just this one.
  plan_already_adopted:
    "You have already adopted this week. Building a new one would replace it.",
};

/** Monday of the current week, in local date. */
function currentMonday(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(d.getDate()).padStart(2, "0")
  }`;
}

export default function StudentWeekPlanPage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [plan, setPlan] = React.useState<WeekPlanRow | null>(null);
  const [goal, setGoal] = React.useState<GoalRow | null>(null);
  const [goalDraft, setGoalDraft] = React.useState({ goal: "health", situation: "" });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  const weekStart = currentMonday();

  const refresh = React.useCallback(async () => {
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) throw new Error("not_signed_in");

    const [planRes, goalRes] = await Promise.all([
      supabase
        .from("student_week_plans")
        .select("id, week_start, items, status, adopted_at")
        .eq("week_start", weekStart)
        .maybeSingle(),
      supabase.from("student_goals").select("goal, situation").maybeSingle(),
    ]);
    // Fail loud: "you have no plan yet" and "we could not read it" are two
    // different sentences, and showing the first for the second invites the
    // student to regenerate over the top of something that exists.
    if (planRes.error) throw new Error(planRes.error.message);
    if (goalRes.error) throw new Error(goalRes.error.message);

    setPlan((planRes.data ?? null) as WeekPlanRow | null);
    const g = (goalRes.data ?? null) as GoalRow | null;
    setGoal(g);
    if (g) setGoalDraft({ goal: g.goal, situation: g.situation ?? "" });
  }, [weekStart]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (!cancelled) setState({ kind: "ready" });
      } catch (err) {
        if (!cancelled) {
          setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setFailure(null);
    try {
      await fn();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const saveGoal = () =>
    run("goal", async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) throw new Error("not_signed_in");
      const { error } = await supabase.from("student_goals").upsert({
        user_id: uid,
        goal: goalDraft.goal,
        situation: goalDraft.situation.trim() || null,
        content_locale: "en-GB",
      }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      await refresh();
    });

  /**
   * Build the week — and ASK FIRST when it would throw away an adopted one.
   *
   * Regenerating replaces the lines and drops the plan back to a draft, which
   * also stops the evening tap and the weekly point (both read
   * `status='adopted'`). That is a real loss, so it is a decision the student
   * makes on purpose rather than one they discover afterwards.
   *
   * The confirmation is the courtesy; the refusal is the guarantee. The server
   * rejects an unconfirmed overwrite on its own (`plan_already_adopted`), so
   * this dialog is not what makes the plan safe — it is what makes saying yes
   * possible.
   */
  const generate = () =>
    run("generate", async () => {
      const replaceAdopted = plan?.status === "adopted";
      if (
        replaceAdopted &&
        !window.confirm(
          "You have already adopted this week. Building a new one replaces it, " +
            "and it stops counting as adopted until you adopt the new one. Continue?",
        )
      ) {
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          authorization: `Bearer ${sess.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          local_date: weekStart,
          ...(replaceAdopted ? { replace_adopted: true } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        const code = String(json?.error ?? `HTTP ${res.status}`);
        throw new Error(ERROR_COPY[code] ?? code);
      }
      await refresh();
    });

  const adopt = () =>
    run("adopt", async () => {
      if (!plan) return;
      const { error } = await supabase
        .from("student_week_plans")
        .update({ status: "adopted", adopted_at: new Date().toISOString() })
        .eq("id", plan.id);
      if (error) throw new Error(error.message);
      await refresh();
    });

  if (state.kind === "loading") {
    return (
      <KeelAppShell variant="student" title="My week">
        <p className="text-sm text-gray-500">Loading…</p>
      </KeelAppShell>
    );
  }
  if (state.kind === "error") {
    return (
      <KeelAppShell variant="student" title="My week">
        <Card tone="warning">
          <p className="text-sm text-gray-900">We could not load your week.</p>
          <p className="mt-1 text-xs text-gray-600">{state.message}</p>
        </Card>
      </KeelAppShell>
    );
  }

  return (
    <KeelAppShell variant="student" title="My week">
      <div className="space-y-6">
        {failure ? (
          <Card tone="warning">
            <p className="text-sm text-gray-900">That did not go through.</p>
            <p className="mt-1 text-xs text-gray-600">{failure}</p>
          </Card>
        ) : null}

        <Card>
          <SectionLabel>Your goal</SectionLabel>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            This is what decides which parts of your coach's method matter for
            you this week. Your coach stays the author of the method — your goal
            only changes what gets brought forward.
          </p>
          <div className="mt-4 space-y-4">
            <Field label="What you are after" htmlFor="goal">
              <select
                id="goal"
                className={inputClass}
                value={goalDraft.goal}
                onChange={(e) => setGoalDraft((p) => ({ ...p, goal: e.target.value }))}
              >
                {GOALS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </Field>
            <Field
              label="Your situation"
              htmlFor="situation"
              hint="What makes a week possible or impossible: canteen, shifts, training, weekends."
            >
              <textarea
                id="situation"
                rows={3}
                className={inputClass}
                value={goalDraft.situation}
                onChange={(e) => setGoalDraft((p) => ({ ...p, situation: e.target.value }))}
              />
            </Field>
            <Button onClick={saveGoal} disabled={busy !== null} variant="secondary">
              {busy === "goal" ? "…" : "Save"}
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel>Week of {weekStart}</SectionLabel>
              {plan ? (
                <p className="mt-2 text-sm text-gray-700">
                  {plan.status === "adopted"
                    ? <Badge tone="positive">Adopted</Badge>
                    : <Badge tone="neutral">Draft</Badge>}
                </p>
              ) : null}
            </div>
            <Button onClick={generate} disabled={busy !== null || !goal}>
              {busy === "generate"
                ? "…"
                : plan
                ? "Regenerate"
                : "Build my week"}
            </Button>
          </div>

          {!goal ? (
            <p className="mt-4 text-sm text-gray-600">
              Set your goal above, then build your week.
            </p>
          ) : !plan ? (
            <p className="mt-4 text-sm text-gray-600">
              No plan yet this week.
            </p>
          ) : (
            <>
              <ul className="mt-4 space-y-5">
                {plan.items.map((item, i) => (
                  <li key={i} className="border-l-2 border-gray-200 pl-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{item.label}</span>
                      {item.kind === "nutrition"
                        ? <Badge tone="info">From your coach's method</Badge>
                        : <Badge tone="neutral">Suggested by Sophia</Badge>}
                    </div>
                    {item.rationale ? (
                      <p className="mt-1 text-xs leading-5 text-gray-600">{item.rationale}</p>
                    ) : null}

                    {/*
                      The derivation, shown rather than asserted. Sophia wrote
                      the line above; the coach wrote this. A student who
                      disagrees with the line can see exactly what it claims to
                      come from — which is the only honest way to present a
                      generated interpretation of somebody else's method.
                    */}
                    {item.source_belief_claim ? (
                      <blockquote className="mt-2 border-l-2 border-gray-300 pl-3 text-xs italic leading-5 text-gray-500">
                        {item.source_belief_claim}
                      </blockquote>
                    ) : null}

                    {item.days.length > 0 ? (
                      <p className="mt-2 text-xs text-gray-500">
                        {item.days.map((d) => DAY_LABELS[d] ?? d).join(" · ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>

              {plan.status !== "adopted" ? (
                <div className="mt-6">
                  <Button onClick={adopt} disabled={busy !== null}>
                    {busy === "adopt" ? "…" : "This is my week"}
                  </Button>
                  <p className="mt-2 text-xs text-gray-500">
                    Nothing is followed until you adopt it. And even then nobody
                    grades you: this is your week, not an exam.
                  </p>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </KeelAppShell>
  );
}
