import React from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import type { WeekSource } from "../api/weekModel";
import type { DayToken } from "../api/types";
import { KeelShellBar } from "../components/KeelAppShell";
import WeekView from "../components/WeekView";
import StudentConstraintsCard from "../components/StudentConstraintsCard";
import CoachNoteCard from "../components/CoachNoteCard";
import CoachSeatCard from "../components/CoachSeatCard";
import { Badge } from "../components/ui/Badge";
import { Card, SectionLabel } from "../components/ui/Card";
import { plural } from "../i18n/plural";
import { formatNumber } from "../i18n/format";
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
        <p className="text-sm text-ink-soft">{t("coach.student.opening")}</p>
      </Frame>
    );
  }

  if (state.kind === "denied") {
    return (
      <Frame>
        <h1 className="font-display text-title text-ink">
          {t("coach.student.denied_title")}
        </h1>
        <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-ink-soft">
          {t("coach.student.denied_body")}
        </p>
        <BackLink />
      </Frame>
    );
  }

  if (state.kind === "error") {
    return (
      <Frame>
        <h1 className="font-display text-title text-ink">
          {t("coach.student.error_title")}
        </h1>
        <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-ink-soft">{state.message}</p>
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
          {/* LE MÊME `h1` QUE `PageHeader`, parce que c'est le même objet: le
              titre d'un écran de travail. `font-display text-title` sans graisse
              — Young Serif n'a QU'UNE graisse et le navigateur simulerait un
              `font-semibold` en épaississant les contours. Cette page ne monte
              pas `KeelAppShell` (elle a son propre châssis, voir `Frame`), donc
              elle est le seul écran coach à devoir poser ce cran elle-même. */}
          <h1 className="min-w-0 font-display text-title text-ink">
            {d.student.full_name?.trim() || t("coach.student.unnamed")}
          </h1>
          {/* PASTILLE MAISON → `Badge tone="neutral"`. C'était un
              `<span className="rounded border border-gray-300 …">`, c'est-à-dire
              une pastille fabriquée à la main — et sa géométrie la trahissait:
              rectangle à petit rayon, quand le kit réserve `rounded-full` aux
              pastilles. « Lecture seule » est un LIBELLÉ sur l'écran, pas un
              état du système: ni ok, ni attention, ni échec, ni info. `neutral`
              est le ton qui dit exactement ça (`bg-line text-ink-soft`, 4,72:1),
              et la garde du chantier tient: aucune figue dans une pastille. */}
          <Badge tone="neutral">{t("coach.student.read_only")}</Badge>
        </div>
        {/*
          ⚠️ `app.plan_untitled` DISAIT « Your plan » / « Ton plan » SUR L'ÉCRAN
          DU COACH, c'est-à-dire à propos du plan de QUELQU'UN D'AUTRE. La clé
          est juste là où elle est née — `/app/today`, où l'élève lit le sien —
          et fausse ici, dans les deux langues. Elle reste partagée et
          inchangée; cet écran a la sienne, qui ne nomme personne.
        */}
        <p className="mt-1 text-sm text-ink-soft">
          {d.plan?.title ?? t("coach.student.plan_untitled")}
        </p>
        {/* LE COMPOSEUR PAR ÉLÈVE A DISPARU (20260804210000), et son lien avec
            lui. KEEL est 1:N: le coach écrit une doctrine, un protocole et une
            bibliothèque de recettes pour toute sa cohorte — il ne compose pas
            la semaine de chacun. Cette page reste ce qu'elle doit être: une
            LECTURE de l'élève, pas un poste de pilotage. */}
      </header>

      {!d.plan && (
        <Card tone="dashed" className="mb-6">
          <p className="text-sm text-ink-soft">{t("coach.student.no_plan")}</p>
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

      {/* ⚠️ LA SEULE ÉCRITURE DE CETTE PAGE, et donc la seule exception à
          l'en-tête « READ-ONLY, and structurally so » ci-dessus.

          Elle ne casse aucun des invariants que cet en-tête défend: pas de
          service role, pas d'impersonation, pas d'appel de fonction edge —
          l'écriture passe par la policy `student_coach_notes_coach_all`,
          exactement comme les lectures passent par les policies Tier A. Ce qui
          change est le MODÈLE PRODUIT, pas l'architecture d'accès: arbitrage du
          2026-08-05 en faveur du mode 1:1 assumé, contre la règle de
          docs/keel/MODEL.md. Le pourquoi complet est dans l'en-tête de la
          migration 20260805180000_student_coach_notes.sql — lis-le avant de
          retirer cette carte comme hors-modèle.

          Placée SOUS les contraintes: ce que l'élève ne peut pas manger se lit
          avant ce que le coach en pense. */}
      <CoachNoteCard studentId={d.student.id} />

      <FoodAndNumbers studentId={d.student.id} />

      {/* LE SIÈGE, TOUT EN BAS ET EXPRÈS.
          C'est la seule commande destructrice de l'écran — elle retire un accès
          à une personne. Elle ne se met pas sur le chemin de la lecture: un
          coach vient ici pour voir sa semaine, pas pour la résilier. Il la
          trouve quand il la cherche.

          Deuxième écriture de la page après la note, et même architecture
          d'accès: pas de service role, pas d'impersonation, pas de fonction
          edge. Trois RPC `security definer` gardées par `auth.uid()` →
          `coaches` (migration 20260806160000). L'en-tête « READ-ONLY » de cette
          page compte donc maintenant deux exceptions, toutes deux nommées. */}
      <CoachSeatCard studentId={d.student.id} />

      <footer className="mt-8 max-w-[62ch] border-t border-line pt-4 text-xs leading-5 text-ink-soft">
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
          .select(
            "local_date, slot_key, portion_band, food_group_ref, recognized, " +
              // FF-009 — les deux axes qui séparent les trois comptes. Sans
              // eux, `aggregateWeekInFood` lirait `undefined` et afficherait
              // trois zéros là où la semaine porte des faits.
              "source, plan_relation",
          )
          .eq("user_id", studentId)
          .gte("local_date", isoDaysAgo(13)),
        supabase
          .from("weekly_reviews")
          // `risk_band` est parti (L3, 2026-08-08): la colonne appartient à
          // l'ancienne weekly review 1:1 et n'a AUCUN écrivain. Voir le bloc
          // « Starting numbers » plus bas pour ce que sa lecture faisait.
          .select("week_start_date, biofeedback")
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
        <p className="text-sm text-ink-soft">{t("coach.student.food.load_error")}</p>
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

  return (
    <div className="mt-6 space-y-6">
      {/* ⚠️ L'ÉTIQUETTE MAISON EST DEVENUE `SectionLabel`, ET ELLE RESTE DANS LA
          CARTE — les deux moitiés de la décision comptent.
          C'était un `<p className="text-xs font-semibold uppercase … gray-400">`:
          le composant du kit recopié à la main, et en moins bon (gray-400 sur
          blanc = 2,84:1, sous le seuil 4,5 du texte). Le kit rend `text-label` +
          `ink-soft` (6,11:1), en `h2`, avec l'équerre.
          ⚠️ ELLE EST DEDANS PARCE QUE LA CHARTE §4 DIT « une section, une FICHE,
          une figure »: une carte autonome est une fiche, et l'équerre en ouvre le
          contenu. Un premier passage l'avait sortie au-dessus de la carte —
          MESURÉ AU RENDU, ça créait un TROISIÈME motif sur le même écran, à côté
          des sections nues de `WeekView` (étiquette dehors, pas de carte) et des
          trois cartes voisines de cette page (`StudentConstraintsCard`,
          `CoachNoteCard`, `CoachSeatCard`, étiquette dedans). Deux motifs disent
          deux objets différents; trois disent qu'on n'a pas tranché.
          ⚠️ NE POSE PAS DE `px-*` sur ce nœud: `.eq` écrit son `padding-left`
          hors de toute couche CSS. */}
      <Card>
        <SectionLabel>{t("coach.student.food.title")}</SectionLabel>
        {food.meals === 0 ? (
          <p className="text-sm text-ink-soft">{t("coach.student.food.empty")}</p>
        ) : (
          <div className="max-w-[62ch] space-y-2 text-sm text-ink">
            {/* ⚠️ LE PLURIEL NE S'ÉCRIT PLUS `> 1 ? "s" : ""`. C'était la règle
                anglaise en dur, et elle est fausse en français (« 1,5 jour »,
                « 0 jour »); `plural()` porte la seule divergence des deux
                langues. Les deux nombres s'accordent séparément, donc chacun
                traverse le seed avec ses deux formes avant d'entrer dans la
                phrase — un gabarit à quatre combinaisons serait quatre clés à
                garder d'accord. */}
            <p>
              {t("coach.student.food.summary", {
                meals: plural(
                  food.meals,
                  t("coach.student.food.meal_value", { count: food.meals }),
                  t("coach.student.food.meals_value", { count: food.meals }),
                ),
                days: plural(
                  food.daysLogged,
                  t("week.day_value", { count: food.daysLogged }),
                  t("week.days_value", { count: food.daysLogged }),
                ),
                vegetables: food.vegMeals,
                protein: food.proteinMeals,
                fruit: food.fruitMeals,
              })}
            </p>
            {/*
              FF-009 — LES TROIS COMPTES, CÔTE À CÔTE ET JAMAIS ADDITIONNÉS.
              Une coche est exacte, une photo est biaisée, un repas hors plan
              est autre chose: trois nombres, jamais un. Aucune somme, aucun
              taux, aucune étiquette de valeur — le verrou de doctrine interdit
              déjà les six formes de « cheat meal », et le produit ne les
              réintroduit pas par un libellé d'écran.
              Les trois valent 0 tant que rien ne les alimente, et un 0 lu est
              un 0 compté: la colonne existe sur toutes les lignes neuves.
            */}
            <p className="text-ink-soft">
              {t("coach.student.food.counts", {
                ticked: food.asPlannedMeals,
                offPlan: food.offPlanMeals,
                photographed: food.photoMeals,
              })}
            </p>
            {food.topFoods.length > 0 ? (
              <p className="text-ink-soft">
                {t("coach.student.food.seen_most", {
                  list: food.topFoods.map((f) => `${f.label} ×${f.count}`).join(" · "),
                })}
              </p>
            ) : null}
            {food.watchCounts.length > 0 ? (
              <p className="text-ink-soft">
                {t("coach.student.food.also_seen", {
                  list: food.watchCounts.map((w) => `${w.label} ×${w.count}`).join(" · "),
                })}
              </p>
            ) : null}
            {food.dinnerLarge && food.dinnerLarge.total >= 2 ? (
              <p className="text-ink-soft">
                {t("coach.student.food.dinners_large", {
                  large: food.dinnerLarge.large,
                  total: food.dinnerLarge.total,
                })}
              </p>
            ) : null}
            {/* TROIS CLÉS, PAS UNE PHRASE À TROU. « More/Fewer/About the same »
                se traduit par trois tournures qui ne partagent ni leur verbe ni
                leur ordre en français; un trou obligerait à y glisser un mot
                comparatif, c'est-à-dire à recomposer la phrase dans le code. */}
            {food.vegTrend ? (
              <p className="text-ink-soft">
                {food.vegTrend === "up"
                  ? t("coach.student.food.veg_trend_up")
                  : food.vegTrend === "down"
                  ? t("coach.student.food.veg_trend_down")
                  : t("coach.student.food.veg_trend_flat")}
              </p>
            ) : null}
            <p className="pt-1 text-xs leading-5 text-ink-soft">
              {t("coach.student.food.footnote")}
            </p>
          </div>
        )}
      </Card>

      {/* Même geste, même placement que ci-dessus: l'étiquette du kit, dans la
          carte, parce qu'une carte autonome est une fiche. */}
      <Card>
        <SectionLabel>{t("coach.student.numbers.title")}</SectionLabel>
        {/*
          ── LA GARDE « SIGNAUX RESTRICTIFS » EST PARTIE (L3, 2026-08-08) ─────
          Elle remplaçait ces fourchettes par « numbers are the wrong tool right
          now » quand `weekly_reviews.risk_band === 'restriction_flag'`.
          L'intention était juste; l'oracle, lui, ne répondait jamais: cette
          colonne appartient à l'ancienne weekly review 1:1 et n'a AUCUN
          écrivain (épreuves d'absence — code, `prosrc`, vues, base — refaites
          le 2026-08-08). MESURÉ 3/3 sur un élève réel portant une escalade
          restrictive VIVANTE (`contract_change_requests`, la seule source
          alimentée): la bannière ne s'affichait DÉJÀ PAS, et les fourchettes
          kcal sortaient quand même.

          POUR LA RÉARMER — et c'est le bon geste, pas le retour de cette
          ligne — il faut lire la source vivante, celle-là même qui alimente la
          page du lundi: `contract_change_requests` avec
          `reason_code='restriction_signal'` et `status='open'`.
        */}
        {numbers === null ? (
          <p className="text-sm text-ink-soft">{t("coach.student.numbers.empty")}</p>
        ) : (
          <div className="max-w-[62ch] space-y-2 text-sm text-ink">
            {/* L'ÉTIQUETTE ET LA FOURCHETTE SONT DEUX CLÉS, et c'est une
                pastille de statistique, pas une phrase coupée en deux: la
                valeur porte le gras parce que c'est elle qu'on vient lire.
                L'unité vit DANS la valeur — « kcal/day » est un mot, pas un
                symbole SI, et il se traduit. */}
            <p>
              {t("coach.student.numbers.maintenance_label")}{" "}
              <span className="font-medium">
                {t("coach.student.numbers.maintenance_value", {
                  low: formatNumber(numbers.maintenanceLow),
                  high: formatNumber(numbers.maintenanceHigh),
                })}
              </span>
            </p>
            <p>
              {t("coach.student.numbers.protein_label")}{" "}
              <span className="font-medium">
                {t("coach.student.numbers.protein_value", {
                  low: numbers.proteinLow,
                  high: numbers.proteinHigh,
                })}
              </span>
            </p>
            <p className="pt-1 text-xs leading-5 text-ink-soft">
              {t("coach.student.numbers.footnote", { weight: numbers.weightKg })}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * LE RETOUR À LA COHORTE.
 *
 * ⚠️ UN LIEN PASSE À LA TEINTE DE MARQUE, ET C'EST LA MOITIÉ « ACTION » DE LA
 * RÈGLE DE COULEUR: la figue marque la navigation et les gestes, les quatre
 * familles d'état marquent les faits. Il était en `gray-500` souligné —
 * c'est-à-dire un lien déguisé en légende. `fig-700` sur `paper` = 9,98:1.
 * Le soulignement reste: la couleur seule ne doit jamais porter l'information.
 */
function BackLink() {
  return (
    <p className="text-sm">
      <Link to="/coach" className="text-fig-700 underline underline-offset-2">
        {t("common.back")}
      </Link>
    </p>
  );
}

/**
 * LE CHÂSSIS DE CETTE PAGE — et il n'est pas `KeelAppShell`, exprès.
 *
 * `/coach/clients/:id` est la seule page coach à ne pas monter le shell complet:
 * elle n'a pas de titre d'écran à lui donner (son titre est le NOM d'un élève,
 * lu après un appel), et son en-tête porte un retour, un `h1` et une pastille de
 * lecture seule que `PageHeader` ne sait pas composer. C'est `KeelShellBar` seule
 * plus une colonne.
 *
 * ⚠️ `bg-white` EST DEVENU `bg-paper`, ET CE N'ÉTAIT PAS UNE NUANCE. La charte
 * refuse le blanc pur — c'est précisément le neutre SANS température qu'elle
 * écarte (`paper` #FBF8FA porte la teinte de marque à 27 % de saturation). Cette
 * page était donc la seule surface coach à rendre le ground d'avant, et les
 * cartes posées dessus perdaient le contraste qu'elles ont partout ailleurs.
 *
 * La colonne reste `max-w-3xl`, ce que `Page width="narrow"` du kit rend aussi —
 * on ne l'appelle pas ici parce que `Page` rend un `<div>` et que ce nœud est le
 * `<main>` de la page: un lot visuel n'échange pas un repère d'accessibilité
 * contre une ligne de moins. `min-h-screen` reste sur l'enveloppe pour que le
 * ground couvre la fenêtre même sur un écran d'erreur de trois lignes.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <KeelShellBar variant="coach" />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
