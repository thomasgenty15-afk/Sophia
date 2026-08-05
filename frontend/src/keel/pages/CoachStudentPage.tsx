import React from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import type { WeekSource } from "../api/weekModel";
import type { DayToken } from "../api/types";
import { KeelShellBar } from "../components/KeelAppShell";
import WeekView from "../components/WeekView";
import StudentConstraintsCard from "../components/StudentConstraintsCard";
import { Card } from "../components/ui/Card";
import { t } from "../i18n/t";
import {
  aggregateWeekInFood,
  coachStartingNumbers,
  type FoodEventRow,
} from "../lib/weekInFood";

// KEEL — /coach/clients/:id. READ-ONLY, and structurally so.
//
// ONE VIEW, TWO READERS. This page mounts `components/WeekView.tsx` — the exact
// component the student mounts on /app/progress. Not a coach variant of it:
// the same file, the same layout, the same model, the same 4/7 gate, the same
// week navigation. The founder's rule is that what the student sees, the coach
// sees; the only way to keep that true past the first sprint is to have no
// second implementation to keep in sync. So this page supplies ONE thing the
// student's page also supplies in its own way: `loadWeek`. Everything else on
// screen is decided elsewhere.
//
// NO SERVICE ROLE, NO IMPERSONATION. Every read below runs under the COACH'S
// OWN JWT and is filtered by the Tier A policies of migration 20260727120000,
// all of which resolve through `coached_student_ids()`. Nothing here asks a
// server function to fetch data "as" the student. That refusal is on the record
// in CONTRACT.md (it would break the auth.uid() = owner invariant the 211
// policies stand on), and it is also why this file contains not a single
// edge-function call: if RLS would not return a row to the coach, no code path
// here can produce it either.
//
// VERBATIM STAYS WITH THE STUDENT. Facts arrive through `coach_student_events`
// (Tier B view), which has no `student_note`, no `media_path` and no
// `source_message_id` — the coach learns THAT a photo exists, never where it
// is. `planned_deviations` is read WITHOUT its `note` column, and RLS only
// returns the rows the student left `coach_visible`. `weekly_reviews` is read
// column by column, numbers only: no `student_narrative`, no `lapse_context`.
// The one prose field that reaches the screen, `student_instruction`, is the
// COACH'S OWN sentence coming back to them.
//
// AUDIT BEFORE READ, FAIL CLOSED. `log_coach_student_access` runs first and the
// page refuses to render if it fails. The RPC raises exactly when the caller is
// not an active coach of this student — the case where the reads would return
// nothing anyway — so failing closed costs a legitimate coach nothing and makes
// "the coach opened my space" a fact, not an intention. It is written ONCE per
// navigation, not once per week browsed: the audited event is the opening of
// the space, and a coach paging back through four weeks did not open four
// spaces.

const COMMITMENT_COLUMNS =
  "id, title, student_instruction, priority, slot_key, unit, target_op, " +
  "target_min, target_max, evaluation_grain, scheduled_days, " +
  "counts_toward_adherence, status";

const EVALUATION_COLUMNS =
  "id, commitment_id, local_date, slot_key, grain, status, timing_status, " +
  "evidence, observed_value";

const EVENT_COLUMNS =
  "id, occurred_at, local_date, slot_key, source, quantity, unit, has_media";

/** No `note`. The column exists; this page does not ask for it. */
const DEVIATION_COLUMNS = "id, local_date, kind, consumed_flex";

const REVIEW_COLUMNS =
  "id, week_start_date, logging_coverage, core_adherence_pct, " +
  "overall_adherence_pct, evaluable_days, flex_used, flex_allowance, outcomes";

interface DirectoryRow {
  id: string;
  full_name: string | null;
  timezone: string | null;
  locale: string | null;
}

interface PlanHeader {
  id: string;
  title: string | null;
  timezone: string;
  week_starts_on: string;
}

interface ReadyData {
  student: DirectoryRow;
  plan: PlanHeader | null;
  timezone: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "denied" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: ReadyData };

export default function CoachStudentPage() {
  const { id: studentId } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  // Survives the StrictMode double-mount so a single navigation writes a single
  // audit line, while a genuine second visit writes a second one.
  const loggedFor = React.useRef<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user || !studentId) {
      setState({ kind: "denied" });
      return;
    }
    setState({ kind: "loading" });

    (async () => {
      try {
        // 1. AUDIT FIRST. The RPC derives coach_id from auth.uid() and refuses
        //    any student outside coached_student_ids(), so a raise here is the
        //    same answer as "you may not read this".
        if (loggedFor.current !== studentId) {
          const { error: auditError } = await supabase.rpc("log_coach_student_access", {
            p_student_user_id: studentId,
            p_surface: "student_dashboard",
          });
          if (auditError) {
            if (!cancelled) setState({ kind: "denied" });
            return;
          }
          loggedFor.current = studentId;
        }

        // 2. Identity, through the column-allowlist view: never email, phone,
        //    birth date or any billing column.
        const directory = await supabase
          .from("coach_student_directory")
          .select("id, full_name, timezone, locale")
          .eq("id", studentId)
          .maybeSingle();
        if (directory.error) throw new Error(directory.error.message);
        const student = directory.data as unknown as DirectoryRow | null;
        if (!student) {
          if (!cancelled) setState({ kind: "denied" });
          return;
        }

        // 3. The published contract — its timezone and week start define which
        //    seven days a week IS, for both readers.
        const planRes = await supabase
          .from("plan_versions")
          .select("id, title, timezone, week_starts_on, status")
          .eq("student_id", studentId)
          .eq("status", "published")
          .maybeSingle();
        if (planRes.error) throw new Error(planRes.error.message);
        const plan = (planRes.data ?? null) as unknown as PlanHeader | null;

        if (cancelled) return;
        setState({
          kind: "ready",
          data: {
            student,
            plan,
            timezone: plan?.timezone ?? student.timezone ??
              Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, studentId]);

  const planId = state.kind === "ready" ? state.data.plan?.id ?? null : null;

  /**
   * The ONE thing this page injects into the shared week: WHERE the rows come
   * from. Five reads, all under the coach's own JWT, all filtered by RLS. A
   * student with no published plan still has a week — facts and deviations
   * exist without a contract — so `lines` is simply empty rather than the page
   * refusing to render.
   */
  const loadWeek = React.useCallback(
    async (args: { weekStart: string; weekDates: string[] }): Promise<WeekSource> => {
      if (!studentId) throw new Error("[keel/coach] no student in the route");
      const from = args.weekDates[0];
      const to = args.weekDates[args.weekDates.length - 1];

      const [commitmentsRes, evaluationsRes, eventsRes, deviationsRes, reviewRes] =
        await Promise.all([
          planId
            ? supabase
              .from("plan_commitments")
              .select(COMMITMENT_COLUMNS)
              .eq("plan_version_id", planId)
              .eq("status", "active")
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("commitment_evaluations")
            .select(EVALUATION_COLUMNS)
            .eq("user_id", studentId)
            .gte("local_date", from)
            .lte("local_date", to),
          supabase
            .from("coach_student_events")
            .select(EVENT_COLUMNS)
            .eq("user_id", studentId)
            .gte("local_date", from)
            .lte("local_date", to),
          supabase
            .from("planned_deviations")
            .select(DEVIATION_COLUMNS)
            .eq("user_id", studentId)
            .gte("local_date", from)
            .lte("local_date", to),
          supabase
            .from("weekly_reviews")
            .select(REVIEW_COLUMNS)
            .eq("user_id", studentId)
            .eq("week_start_date", args.weekStart)
            .maybeSingle(),
        ]);

      for (const res of [
        commitmentsRes,
        evaluationsRes,
        eventsRes,
        deviationsRes,
        reviewRes,
      ]) {
        if (res.error) throw new Error(res.error.message);
      }

      // The shared browser client carries no generated `Database` generic, so
      // PostgREST types every KEEL select as an opaque row. Each cast states
      // the shape this page asked for, column by column, in the constants above.
      return {
        lines: (commitmentsRes.data ?? []) as unknown as WeekSource["lines"],
        evaluations: (evaluationsRes.data ?? []) as unknown as WeekSource["evaluations"],
        facts: (eventsRes.data ?? []) as unknown as WeekSource["facts"],
        deviations: (deviationsRes.data ?? []) as unknown as WeekSource["deviations"],
        review: (reviewRes.data ?? null) as unknown as WeekSource["review"],
      };
    },
    [studentId, planId],
  );

  if (state.kind === "loading") {
    return (
      <Frame>
        <p className="text-sm text-gray-500">{t("coach.student.opening")}</p>
      </Frame>
    );
  }

  if (state.kind === "denied") {
    return (
      <Frame>
        <h1 className="text-xl font-semibold text-gray-900">
          {t("coach.student.denied_title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {t("coach.student.denied_body")}
        </p>
        <BackLink />
      </Frame>
    );
  }

  if (state.kind === "error") {
    return (
      <Frame>
        <h1 className="text-xl font-semibold text-gray-900">
          {t("coach.student.error_title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">{state.message}</p>
        <BackLink />
      </Frame>
    );
  }

  const d = state.data;

  return (
    <Frame>
      <header className="mb-6">
        <BackLink />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-gray-900">
            {d.student.full_name?.trim() || t("coach.student.unnamed")}
          </h1>
          <span className="rounded border border-gray-300 px-2 py-0.5 text-[11px] uppercase tracking-wide text-gray-500">
            {t("coach.student.read_only")}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {d.plan?.title ?? t("app.plan_untitled")}
        </p>
        {/* THE WAY IN TO THE MEAL COMPOSER.
            `/coach/clients/:id/meals` shipped with no link anywhere in the
            product — the coach had to type the URL. It is offered only when a
            plan is published, because the composer hangs off a published plan
            version and its own screen would otherwise open on a refusal. */}
        {d.plan && (
          <p className="mt-3">
            <Link
              to={`/coach/clients/${d.student.id}/meals`}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t("coach.student.meal_plan_cta")}
            </Link>
          </p>
        )}
      </header>

      {!d.plan && (
        <Card tone="dashed" className="mb-6">
          <p className="text-sm text-gray-500">{t("coach.student.no_plan")}</p>
        </Card>
      )}

      {/* THE WEEK — the student's own screen, mounted here. */}
      <WeekView
        timezone={d.timezone}
        weekStartsOn={((d.plan?.week_starts_on || "mon") as DayToken)}
        loadWeek={loadWeek}
        subjectKey={d.student.id}
      />

      {/* C8 — the food journal and the starting numbers. Same doctrine as the
          rest of this page: every read below runs under the COACH'S OWN JWT
          (Tier B view + Tier A weekly_reviews policy), no edge function, no
          impersonation. */}
      {/* CE QU'IL NE PEUT PAS MANGER — au-dessus du journal, exprès.
          Le coach PRESCRIT: un programme écrit sans savoir que l'élève est
          anaphylactique à l'arachide est un programme qu'il faudra défaire.
          C'est aussi le seul endroit du produit où l'on peut voir qu'une
          contrainte est écrite dans les mots de l'élève — donc reconnue sur ce
          mot seul — et la reformuler avec lui. */}
      <StudentConstraintsCard studentId={d.student.id} />

      <FoodAndNumbers studentId={d.student.id} />

      <footer className="mt-8 border-t border-gray-100 pt-4 text-xs leading-5 text-gray-500">
        {t("coach.student.footer")}
      </footer>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// C8 — « On the plate » + « Starting numbers »
// ---------------------------------------------------------------------------

interface FoodReviewRow {
  week_start_date: string;
  biofeedback: Record<string, unknown> | null;
  risk_band: string | null;
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(d.getDate()).padStart(2, "0")
  }`;
}

/**
 * The aggregation is the SAME function the student's own progress page runs
 * (`lib/weekInFood.ts`) — one implementation, two readers, same numbers. The
 * only coach-side addition is `coachStartingNumbers`, and it is coach-side BY
 * RULE: ranges shown to a student become targets, and nobody grades here.
 */
function FoodAndNumbers({ studentId }: { studentId: string }) {
  const [rows, setRows] = React.useState<FoodEventRow[] | null>(null);
  const [prevRows, setPrevRows] = React.useState<FoodEventRow[]>([]);
  const [reviews, setReviews] = React.useState<FoodReviewRow[]>([]);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = isoDaysAgo(6);
      const [eventsRes, reviewsRes] = await Promise.all([
        supabase
          .from("coach_student_events")
          .select("local_date, slot_key, portion_band, food_group_ref, recognized")
          .eq("user_id", studentId)
          .gte("local_date", isoDaysAgo(13)),
        supabase
          .from("weekly_reviews")
          .select("week_start_date, biofeedback, risk_band")
          .eq("user_id", studentId)
          .order("week_start_date", { ascending: false })
          .limit(8),
      ]);
      if (cancelled) return;
      if (eventsRes.error || reviewsRes.error) {
        // A failed read renders AS a failed read — never as "no data", which
        // would tell the coach their student logged nothing.
        setFailed(true);
        return;
      }
      const all = (eventsRes.data ?? []) as unknown as FoodEventRow[];
      setRows(all.filter((e) => e.local_date >= since));
      setPrevRows(all.filter((e) => e.local_date < since));
      setReviews((reviewsRes.data ?? []) as unknown as FoodReviewRow[]);
    })();
    return () => { cancelled = true; };
  }, [studentId]);

  if (failed) {
    return (
      <Card tone="dashed" className="mt-6">
        <p className="text-sm text-gray-500">
          The food journal could not be loaded just now.
        </p>
      </Card>
    );
  }
  if (rows === null) return null;

  const food = aggregateWeekInFood(rows, {
    dates: Array.from({ length: 7 }, (_, i) => isoDaysAgo(6 - i)),
    prevRows,
  });

  // The latest weigh-in wins; older reviews only fill in when the student
  // skipped the numbers on Sunday.
  const latestWeight = reviews
    .map((r) => Number((r.biofeedback ?? {})["weight_kg"]))
    .find((w) => Number.isFinite(w) && w > 0) ?? null;
  const numbers = latestWeight === null ? null : coachStartingNumbers(latestWeight);
  const restrictionFlagged = reviews[0]?.risk_band === "restriction_flag";

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          On the plate — last 7 days
        </p>
        {food.meals === 0 ? (
          <p className="mt-2 text-sm text-gray-600">
            No meals read this week. The Monday page tells you if they have
            gone quiet everywhere, not just here.
          </p>
        ) : (
          <div className="mt-3 space-y-2 text-sm text-gray-800">
            <p>
              <span className="font-medium">{food.meals}</span> meal{food.meals > 1 ? "s" : ""} across{" "}
              <span className="font-medium">{food.daysLogged}</span> day{food.daysLogged > 1 ? "s" : ""} ·
              vegetables at {food.vegMeals} · protein at {food.proteinMeals} · fruit at {food.fruitMeals}.
            </p>
            {food.topFoods.length > 0 ? (
              <p className="text-gray-700">
                Seen most: {food.topFoods.map((f) => `${f.label} ×${f.count}`).join(" · ")}
              </p>
            ) : null}
            {food.watchCounts.length > 0 ? (
              <p className="text-gray-700">
                Also: {food.watchCounts.map((w) => `${w.label} ×${w.count}`).join(" · ")}
              </p>
            ) : null}
            {food.dinnerLarge && food.dinnerLarge.total >= 2 ? (
              <p className="text-gray-700">
                Dinners ran large {food.dinnerLarge.large} of {food.dinnerLarge.total} nights.
              </p>
            ) : null}
            {food.vegTrend ? (
              <p className="text-gray-700">
                {food.vegTrend === "up"
                  ? "More vegetables than the week before."
                  : food.vegTrend === "down"
                  ? "Fewer vegetables than the week before."
                  : "About the same vegetables as the week before."}
              </p>
            ) : null}
            <p className="pt-1 text-xs leading-5 text-gray-500">
              Frequency read of their photo log — the same numbers they see.
              The photos themselves stay with the student.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Starting numbers
        </p>
        {restrictionFlagged ? (
          // Clinical prudence outranks convenience: handing out deficit-ready
          // brackets in a restriction-flagged week invites exactly the wrong
          // move. The flag itself already reached you on the Monday page.
          <p className="mt-2 text-sm leading-6 text-gray-800">
            Restriction signals this week — numbers are the wrong tool right
            now. Reach out first.
          </p>
        ) : numbers === null ? (
          <p className="mt-2 text-sm text-gray-600">
            No weigh-in yet. Ranges appear after their first Sunday check-in
            with a weight.
          </p>
        ) : (
          <div className="mt-3 space-y-2 text-sm text-gray-800">
            <p>
              Maintenance ≈{" "}
              <span className="font-medium">
                {numbers.maintenanceLow.toLocaleString("en-GB")}–{numbers.maintenanceHigh.toLocaleString("en-GB")} kcal/day
              </span>
            </p>
            <p>
              Protein ≈{" "}
              <span className="font-medium">
                {numbers.proteinLow}–{numbers.proteinHigh} g/day
              </span>
            </p>
            <p className="pt-1 text-xs leading-5 text-gray-500">
              Computed from their {numbers.weightKg} kg weigh-in alone — no
              height, age or activity in the math, so treat it as the bracket
              you would open, not the number you would prescribe. Never derived
              from photos, and the student never sees these figures.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <p className="text-sm">
      <Link to="/coach" className="text-gray-500 underline">
        {t("common.back")}
      </Link>
    </p>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <KeelShellBar variant="coach" />
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
