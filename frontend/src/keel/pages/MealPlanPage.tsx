import React from "react";
import { Link, useParams } from "react-router-dom";

import { supabase } from "../../lib/supabase";
import { dayTokenOf, localDateIn } from "../api/dates";
import {
  archiveMealIdea,
  createMealIdea,
  type DayToken,
  loadMealWeek,
  type MealIdea,
  type MealPlanEntry,
  type MealWeek,
  placeMeal,
  unplaceMeal,
} from "../api/mealPlanModel";
import { KeelShellBar } from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Page, PageHeader } from "../components/ui/Page";
import { c } from "./mealPlan/copy";
import { MealIdeaLibrary } from "./mealPlan/MealIdeaLibrary";
import { MealWeekGrid } from "./mealPlan/MealWeekGrid";
import { WeekCoveragePanel } from "./mealPlan/WeekCoveragePanel";

// KEEL — /coach/clients/:studentId/meals. The coach composes the week.
//
// WHY THIS SCREEN EXISTS. The plan says "two servings of vegetables a day".
// The student's actual question at 12:40 is "so what do I eat". Those are not
// the same question, and until now the product only answered the first. This
// screen answers the second, in the coach's own words.
//
// THREE THINGS IT IS NOT, and each is structural rather than stated:
//
//   - IT IS NOT A SECOND AUTHOR. Every dish here was typed by the coach.
//     `meal_ideas.author_kind` accepts 'coach' and 'keel_library' and there is
//     no third value, so no future refactor can quietly make a model the
//     author of what a student reads.
//   - IT IS NOT GRADED. Adherence is computed from `plan_commitments` alone.
//     `commitment_evaluations.commitment_id` references that table, so a meal
//     id cannot produce an evaluation — the wall is a foreign key, not a rule
//     somebody has to remember.
//   - IT LOGS NOTHING. Composing a week writes no fact. Two facts on four days
//     is the entire gate on whether the coach's weekly read shows a number at
//     all; a suggested dish that logged itself would lift that gate on its own.
//
// The coverage panel at the bottom is what makes the screen useful rather than
// decorative: it reads the coach's OWN nutrition lines back against the dishes
// they have placed. It is information for the coach, it is on a coach screen
// only, and it changes nothing about the student's adherence.

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "no_plan" }
  | { kind: "ready"; week: MealWeek; studentName: string | null };

async function accessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export default function MealPlanPage() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [selectedIdeaId, setSelectedIdeaId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [flash, setFlash] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState({ kind: "loading" });
    try {
      // The coach reads the plan header under their OWN JWT: the Tier A policy
      // on plan_versions resolves through coached_student_ids(), so a student
      // who is not theirs returns nothing here — no impersonation, no
      // service-role fetch "as" the student.
      const planRes = await supabase
        .from("plan_versions")
        .select("id, student_id, title, status")
        .eq("student_id", studentId)
        .eq("status", "published")
        .maybeSingle();
      if (planRes.error) throw new Error(planRes.error.message);
      if (!planRes.data) {
        setState({ kind: "no_plan" });
        return;
      }
      const planId = String((planRes.data as { id: string }).id);

      const [week, directory] = await Promise.all([
        loadMealWeek(planId, await accessToken()),
        supabase
          .from("coach_student_directory")
          .select("id, full_name")
          .eq("id", studentId)
          .maybeSingle(),
      ]);
      setState({
        kind: "ready",
        week,
        studentName:
          (directory.data as { full_name: string | null } | null)?.full_name ?? null,
      });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [studentId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const week = state.kind === "ready" ? state.week : null;
  const selectedIdea: MealIdea | null = week
    ? week.ideas.find((i) => i.id === selectedIdeaId) ?? null
    : null;

  /**
   * One place where every mutation lands, so every mutation ends with a RE-READ
   * of the week. The screen never renders an effect it has not read back — the
   * phantom-commit rule, applied to a grid.
   */
  const mutate = React.useCallback(
    async (run: (token: string | null) => Promise<string | null>) => {
      setBusy(true);
      setActionError(null);
      try {
        const message = await run(await accessToken());
        await load();
        setFlash(message);
      } catch (error) {
        setFlash(null);
        setActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const handlePlace = async (
    ideaId: string,
    slotKey: string,
    days: readonly DayToken[],
  ) => {
    if (!week) return;
    await mutate(async (token) => {
      const result = await placeMeal(
        {
          plan_version_id: week.plan_version.id,
          meal_idea_id: ideaId,
          slot_key: slotKey,
          day_tokens: days,
        },
        token,
      );
      // What is announced is what the server READ BACK, never days.length.
      const written = result.placed.length;
      if (written === 0) return c("meals.grid.placed_none");
      if (written === result.requested) {
        return written === 1
          ? c("meals.grid.placed_one")
          : c("meals.grid.placed_many", { count: written });
      }
      return c("meals.grid.placed_partial", {
        count: written,
        requested: result.requested,
      });
    });
  };

  const todayToken: DayToken | null = React.useMemo(() => {
    try {
      return dayTokenOf(localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone));
    } catch {
      return null;
    }
  }, []);

  return (
    <>
      <KeelShellBar variant="coach" />
      <Page width="wide" fullHeight={false}>
        <PageHeader
          title={c("meals.title")}
          subtitle={c("meals.subtitle")}
          actions={
            <Link
              to={`/coach/clients/${studentId}`}
              className="text-sm text-gray-600 underline underline-offset-2"
            >
              {c("meals.back_to_student")}
            </Link>
          }
        />

        {state.kind === "loading" && (
          <p className="text-sm text-gray-500">{c("meals.loading")}</p>
        )}

        {state.kind === "error" && (
          <Card tone="warning">
            <p className="text-sm text-amber-900">
              {c("meals.error", { message: state.message })}
            </p>
          </Card>
        )}

        {state.kind === "no_plan" && (
          <Card tone="dashed">
            <p className="text-sm font-medium text-gray-900">
              {c("meals.no_plan_title")}
            </p>
            <p className="mt-1 text-sm text-gray-600">{c("meals.no_plan_body")}</p>
          </Card>
        )}

        {state.kind === "ready" && week && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {state.studentName && (
                <Badge tone="neutral">
                  {c("meals.for_student", { name: state.studentName })}
                </Badge>
              )}
              {flash && <Badge tone="positive">{flash}</Badge>}
              {actionError && <Badge tone="critical">{actionError}</Badge>}
            </div>

            {/* The doctrine, said plainly, at the top of the screen the coach
                works on. If it is only true in the schema, the coach will
                assume the opposite the first time they see a count. */}
            <Card tone="dashed">
              <p className="text-sm font-medium text-gray-900">
                {c("meals.not_scored_title")}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {c("meals.not_scored_body")}
              </p>
            </Card>

            <MealIdeaLibrary
              ideas={week.ideas}
              slots={week.vocabulary.slots}
              foodGroups={week.vocabulary.food_groups}
              selectedIdeaId={selectedIdeaId}
              busy={busy}
              onSelect={setSelectedIdeaId}
              onCreate={async (draft) => {
                await mutate(async (token) => {
                  const { idea } = await createMealIdea(draft, token);
                  // Selecting it immediately is the difference between "write a
                  // dish" and "write a dish, then go and find it again".
                  setSelectedIdeaId(idea.id);
                  return null;
                });
              }}
              onArchive={async (ideaId) => {
                await mutate(async (token) => {
                  await archiveMealIdea(ideaId, token);
                  setSelectedIdeaId((current) =>
                    current === ideaId ? null : current
                  );
                  return null;
                });
              }}
            />

            <MealWeekGrid
              entries={week.entries}
              ideas={week.ideas}
              slots={week.vocabulary.slots}
              selectedIdea={selectedIdea}
              busy={busy}
              todayToken={todayToken}
              onPlace={async (slotKey, days) => {
                if (!selectedIdea) return;
                await handlePlace(selectedIdea.id, slotKey, days);
              }}
              onRemove={async (entryId) => {
                await mutate(async (token) => {
                  const result = await unplaceMeal([entryId], token);
                  return result.removed.length > 0 ? null : null;
                });
              }}
              onRepeat={async (entry: MealPlanEntry, days) => {
                await handlePlace(entry.meal_idea_id, entry.slot_key, days);
              }}
            />

            <WeekCoveragePanel coverage={week.coverage} />
          </div>
        )}
      </Page>
    </>
  );
}
