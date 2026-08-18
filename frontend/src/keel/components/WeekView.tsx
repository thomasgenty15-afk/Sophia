import React from "react";
import { localDateIn, weekDatesFrom, weekStartFor } from "../api/dates";
import {
  commitmentAmount,
  deviationKindLabel,
  messageKey,
  slotLabel,
  statusLabel,
  unitLabel,
} from "../api/labels";
import { LOGGED_DAY_MIN_EVENTS, WEEK_DAYS } from "../api/progressModel";
import {
  buildWeekModel,
  isoWeekLabelFor,
  nextWeekStart,
  previousWeekStart,
  type WeekDayCell,
  type WeekLineSummary,
  type WeekModel,
  type WeekSource,
} from "../api/weekModel";
import type { DayToken, EvalStatus } from "../api/types";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import { plural } from "../i18n/plural";
import { t } from "../i18n/t";

// KEEL — ONE week, ONE component, TWO readers.
//
// THE REQUIREMENT, verbatim from the founder: "there is no need for a different
// interface: what the student sees, the coach must see too. And it can be week
// by week. But there also has to be a kind of summary with interesting metrics
// at the end of each week, and the weeks have to be reachable."
//
// SO THE DIFFERENCE BETWEEN THE TWO SCREENS IS NOT IN THIS FILE. There is no
// `viewer` prop, no `isCoach` branch, no copy that changes person. The only
// thing a page injects is `loadWeek` — i.e. WHERE the rows come from, which is
// exactly where the security boundary already lives: the student reads their
// own rows, the coach reads the same week through `coached_student_ids()` and
// the `coach_student_events` view. RLS decides what a reader may see; this
// component decides how a week LOOKS, and there is only one answer.
//
// WHAT THIS MEANS IN PRACTICE, for the coach: they get no privileged number.
// The 4/7 coverage gate closes on both screens at once, the same lines are
// ranked, the same day is blank. And they get no verbatim: `WeekFact` and
// `WeekDeviation` (weekModel.ts) carry no `note`, no `media_path` — there is
// no field here to leak.
//
// ORDER OF THE PAGE, and why: coverage FIRST (the only metric with predictive
// validity early on), then the week's shape day by day, then what held and what
// slipped, then the gated percentage, then the lines, then the raw facts. Never
// weight, never a calorie: nothing below reads an `energy` measure or a macro,
// by construction.

export interface WeekViewProps {
  /** the plan's timezone — every local date on screen is resolved in it */
  timezone: string;
  weekStartsOn: DayToken;
  /**
   * The ONE injected difference between the student's page and the coach's.
   * Must be stable across renders (wrap it in `useCallback`) or memoised by the
   * caller; it is read through a ref so an inline arrow cannot loop the effect.
   */
  loadWeek: (args: {
    weekStart: string;
    weekDates: string[];
  }) => Promise<WeekSource>;
  /** identity of the subject; a change refetches and returns to this week */
  subjectKey: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; model: WeekModel };

export default function WeekView(props: WeekViewProps) {
  const { timezone, weekStartsOn, subjectKey } = props;

  const currentWeekStart = React.useMemo(
    () => weekStartFor(localDateIn(timezone), weekStartsOn),
    [timezone, weekStartsOn],
  );
  const [weekStart, setWeekStart] = React.useState(currentWeekStart);
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [reloadNonce, setReloadNonce] = React.useState(0);

  const loadRef = React.useRef(props.loadWeek);
  // ⚠️ ÉCRITE DANS UN EFFET, PAS PENDANT LE RENDU (`react-hooks/refs`). React
  // peut rendre sans committer: une ref écrite pendant le rendu garderait alors
  // la fonction d'un rendu jeté. L'ordre de chargement ne change pas — cet effet
  // est déclaré AVANT celui qui charge, donc il a déjà rafraîchi `loadRef` quand
  // la semaine part se chercher, et le premier rendu part de `useRef` lui-même.
  React.useEffect(() => {
    loadRef.current = props.loadWeek;
  });

  // A different student is a different week history: go back to this week.
  React.useEffect(() => setWeekStart(currentWeekStart), [subjectKey, currentWeekStart]);

  React.useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    const weekDates = weekDatesFrom(weekStart);
    (async () => {
      try {
        const source = await loadRef.current({ weekStart, weekDates });
        if (cancelled) return;
        // `today` is resolved AT LOAD TIME, in the plan's timezone: a tab left
        // open across midnight must not keep calling yesterday "today" and
        // greying out a day the student can still log.
        const model = buildWeekModel({
          weekStart,
          weekDates,
          today: localDateIn(timezone),
          source,
        });
        setState({ kind: "ready", model });
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
  }, [subjectKey, weekStart, timezone, reloadNonce]);

  const label = isoWeekLabelFor(weekStart);
  const weekDates = weekDatesFrom(weekStart);
  const canGoNext = weekStart < currentWeekStart;

  return (
    <div>
      {/* LE FRONTON DE LA SEMAINE. `paper-2` fermé par un trait `line`, c'est
          l'idiome de la fiche — celui du bandeau de titre de `ui/Modal.tsx` et
          de `/auth`. Il portait `bg-gray-50` avec un cadre `gray-200`, or le
          ground de l'écran est maintenant `paper`: un remplissage plus clair que
          la page n'existe plus dans la charte, et c'est le trait qui dessine. */}
      <nav className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-paper-2 px-3 py-2">
        <NavButton
          label={t("week.nav.previous")}
          glyph="<"
          onClick={() => setWeekStart(previousWeekStart(weekStart))}
          disabled={false}
        />
        <div className="text-center">
          <p className="text-sm font-semibold text-ink">
            {t("week.label", { week: label.isoWeek, year: label.isoYear })}
          </p>
          <p className="text-xs tabular-nums text-ink-soft">
            {t("week.range", {
              from: weekDates[0],
              to: weekDates[WEEK_DAYS - 1],
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {weekStart !== currentWeekStart && (
            // REVENIR À LA SEMAINE EN COURS EST UNE NAVIGATION, donc la teinte
            // de marque: la règle de couleur de l'app donne à la figue les liens
            // et les gestes, aux quatre familles d'état les faits. Souligné et
            // non encadré parce que c'est un saut, pas une commande.
            <button
              type="button"
              onClick={() => setWeekStart(currentWeekStart)}
              className="rounded-full px-3 py-1 text-xs text-fig-700 underline hover:bg-fig-50"
            >
              {t("week.nav.current")}
            </button>
          )}
          <NavButton
            label={t("week.nav.next")}
            glyph=">"
            onClick={() => setWeekStart(nextWeekStart(weekStart))}
            disabled={!canGoNext}
          />
        </div>
      </nav>

      {state.kind === "loading" && (
        <p className="text-sm text-ink-soft">{t("week.loading")}</p>
      )}

      {state.kind === "error" && (
        // ⛔ L'AMBRE RESTE: un avertissement PORTE UN FAIT, et la charte autorise
        // un état à être une surface et pas seulement une pastille. Seul le
        // `font-mono` est parti — la charte ne nomme que deux familles (Young
        // Serif en display, Public Sans partout ailleurs), et une troisième en
        // repli système au milieu d'une phrase se voit.
        <Card tone="warning">
          <p className="text-sm text-amber-900">{t("week.error")}</p>
          <p className="mt-1 text-xs text-amber-800">{state.message}</p>
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="mt-2 text-xs text-amber-900 underline"
          >
            {t("week.retry")}
          </button>
        </Card>
      )}

      {state.kind === "ready" && <WeekBody model={state.model} />}
    </div>
  );
}

function WeekBody({ model }: { model: WeekModel }) {
  return (
    <>
      {model.isCurrent && (
        <p className="mb-4 rounded-card border border-line bg-paper-2 px-3 py-2 text-xs text-ink-soft">
          {t("week.in_progress")}
        </p>
      )}

      {!model.hasAnyRecord && (
        // Le vide en attente se distingue du plein par la FORME (le pointillé),
        // exactement comme `Card tone="dashed"`, donc au même trait de contrôle.
        <p className="mb-4 rounded-card border border-dashed border-line-strong p-6 text-center text-sm text-ink-soft">
          {t("week.empty")}
        </p>
      )}

      {/* 1 — THE SUMMARY. Coverage first, on purpose. */}
      <SectionLabel className="mb-2">{t("week.summary_title")}</SectionLabel>
      <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label={t("week.coverage_label")}
          value={t("week.coverage_value", {
            count: model.coverage.loggedDays,
            total: WEEK_DAYS,
          })}
        />
        <Metric
          label={t("week.run_label")}
          value={dayCount(model.longestRunDays)}
        />
        <Metric
          label={t("week.facts_label")}
          value={String(model.factCount)}
        />
        <Metric
          label={t("week.deviations_label")}
          value={String(model.deviations.length)}
        />
      </div>
      <p className="mb-6 text-xs text-ink-soft">
        {t("week.coverage_caption", { min: LOGGED_DAY_MIN_EVENTS })}
      </p>

      {/* 2 — THE WEEK'S SHAPE, day by day. */}
      <section className="mb-6">
        <SectionLabel className="mb-2">{t("week.days_title")}</SectionLabel>
        <div className="grid grid-cols-7 gap-1">
          {model.days.map((day) => (
            <div
              key={day.date}
              title={`${day.date} - ${t("week.day_facts", { count: day.factCount })}`}
              className={[
                "rounded-card border px-1 py-2 text-center",
                // ⛔ L'ÉMERAUDE RESTE, ET ELLE PORTE UN FAIT: « ce jour compte
                // pour la couverture » est un ok du système, pas une décoration.
                // Seuls les deux neutres ont bougé — un jour sans fait n'est plus
                // « plus clair que la page », il est la page avec un trait.
                day.isFuture
                  ? "border-dashed border-line bg-paper"
                  : day.countsForCoverage
                  ? "border-emerald-200 bg-emerald-50"
                  : day.factCount > 0
                  ? "border-emerald-100 bg-emerald-50/40"
                  : "border-line bg-paper-2",
              ].join(" ")}
            >
              {/* `tracking-wide` (0,025em) et pas `text-label` (0,1em): sept
                  colonnes à 320 px laissent ~38 px par case, et l'approche de
                  l'étiquette de la charte ferait déborder « MON ». */}
              <div className="text-[11px] uppercase tracking-wide text-ink-soft">
                {dayLabel(day.dayToken)}
              </div>
              <div className="text-sm font-semibold tabular-nums text-ink">
                {day.isFuture ? "-" : day.factCount}
              </div>
              {day.deviationKinds.length > 0 && (
                // LE MOT PORTE LE FAIT, LA COULEUR N'AJOUTAIT RIEN. C'était
                // `text-violet-700` — une cinquième teinte sur une grille qui
                // en tient déjà trois sur sept colonnes à 320 px. « Declared »
                // est le seul mot de la case: il se lit sans être peint.
                <div className="mt-0.5 text-[10px] text-ink-soft">
                  {t("week.day_declared")}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 3 — WHAT HELD, WHAT SLIPPED. Behind the SAME gate as the percentage. */}
      <section className="mb-6">
        <SectionLabel className="mb-2">{t("week.highlights_title")}</SectionLabel>
        {model.highlights.kind === "insufficient_data"
          ? (
            <p className="rounded-card border border-line bg-paper-2 p-3 text-xs leading-5 text-ink-soft">
              {t("week.highlight_locked", {
                min: model.highlights.minLoggedDays,
                logged: model.highlights.loggedDays,
              })}
            </p>
          )
          : model.highlights.mostHeld === null &&
              model.highlights.mostDropped === null
          ? (
            <p className="rounded-card border border-line bg-paper-2 p-3 text-xs leading-5 text-ink-soft">
              {t("week.highlight_none")}
            </p>
          )
          : (
            <div className="grid gap-3 sm:grid-cols-2">
              {model.highlights.mostHeld && (
                <Highlight
                  title={t("week.highlight_held")}
                  tone="held"
                  summary={model.highlights.mostHeld}
                />
              )}
              {model.highlights.mostDropped && (
                <Highlight
                  title={t("week.highlight_dropped")}
                  tone="dropped"
                  summary={model.highlights.mostDropped}
                />
              )}
            </div>
          )}
      </section>

      {/* 4 — ADHERENCE. The refusal variant carries no percentage field, so
          there is nothing here to forget to hide. */}
      <section className="mb-6">
        <SectionLabel className="mb-2">{t("week.adherence_label")}</SectionLabel>
        {model.adherence.kind === "insufficient_data"
          ? (
            <div className="rounded-card border border-line bg-paper-2 p-3">
              {/* PASTILLE MAISON → `Badge tone="neutral"`. « Verrouillé » n'est
                  pas un échec — la garde de couverture 4/7 n'accuse personne,
                  elle refuse de publier un chiffre qu'elle ne peut pas mesurer.
                  `neutral` est le seul ton qui dise ça sans le colorer. */}
              <Badge tone="neutral">{t("week.adherence_locked")}</Badge>
              <p className="mt-2 text-xs leading-5 text-ink-soft">
                {model.adherence.reason === "logging_coverage_below_gate"
                  ? t("week.adherence_gate", {
                    min: model.adherence.minLoggedDays,
                    logged: model.adherence.loggedDays,
                  })
                  : t("week.adherence_no_review")}
              </p>
            </div>
          )
          : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric
                label={t("week.adherence_overall")}
                value={`${model.adherence.overallPct}%`}
              />
              {model.adherence.corePct !== null && (
                <Metric
                  label={t("week.adherence_core")}
                  value={`${model.adherence.corePct}%`}
                />
              )}
              <Metric
                label={t("week.coverage_label")}
                value={t("week.coverage_value", {
                  count: model.adherence.loggedDays,
                  total: WEEK_DAYS,
                })}
              />
            </div>
          )}
      </section>

      {/* 5 — LINE BY LINE. The grid IS the shared view: rows are the coach's
          prescription, columns are the seven days, cells are DERIVED statuses
          read from `commitment_evaluations` — never computed here. */}
      <section className="mb-6">
        <SectionLabel className="mb-2">{t("week.lines_title")}</SectionLabel>
        {model.lines.length === 0
          ? <p className="text-sm text-ink-soft">{t("week.lines_empty")}</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] border-separate border-spacing-y-1">
                <thead>
                  <tr>
                    <th className="w-1/2 px-1 text-left text-[11px] font-medium uppercase tracking-wide text-ink-soft">
                      {t("week.lines_col_line")}
                    </th>
                    {model.days.map((day) => (
                      <th
                        key={day.date}
                        className="px-1 text-center text-[11px] font-medium uppercase tracking-wide text-ink-soft"
                      >
                        {dayLabel(day.dayToken)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.lines.map((summary) => (
                    <tr key={summary.line.id} className="align-top">
                      <td className="px-1 py-1">
                        <p className="text-sm text-ink">{summary.line.title}</p>
                        <p className="text-[11px] text-ink-soft">
                          {[
                            summary.line.slot_key
                              ? slotLabel(summary.line.slot_key)
                              : null,
                            commitmentAmount(summary.line) || null,
                            summary.line.evaluation_grain === "week"
                              ? t("week.line_weekly")
                              : null,
                            summary.line.counts_toward_adherence
                              ? null
                              : t("today.outcome_only"),
                          ]
                            .filter(Boolean)
                            .join(" - ")}
                        </p>
                        {summary.line.student_instruction && (
                          <p className="text-[11px] italic text-ink-soft">
                            {summary.line.student_instruction}
                          </p>
                        )}
                      </td>
                      {summary.cells.map((cell) => (
                        <td key={cell.date} className="px-1 py-1 text-center">
                          <StatusDot cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <Legend />
      </section>

      {/* 6 — DECLARED IN ADVANCE. Out of the denominator, not out of the week. */}
      <section className="mb-6">
        <SectionLabel className="mb-2">{t("week.deviations_title")}</SectionLabel>
        <p className="mb-2 text-xs text-ink-soft">{t("week.deviations_caption")}</p>
        {model.deviations.length === 0
          ? <p className="text-sm text-ink-soft">{t("week.deviations_empty")}</p>
          : (
            <ul className="space-y-1.5">
              {model.deviations.map((d) => (
                // LA SECTION DIT DÉJÀ CE QUE LA COULEUR DISAIT. Ces lignes
                // étaient `border-violet-200 bg-violet-50 text-violet-900`: une
                // liste entière peinte dans la marque du produit supprimé, sous
                // un titre de section qui annonce littéralement « déclaré à
                // l'avance ». La distinction est portée par l'ENDROIT et par la
                // forme — une case tracée sur la fiche, remplissage du ground et
                // trait de contrôle, comme `ui/Card.tsx`.
                <li
                  key={d.id}
                  className="rounded-card border border-line-strong bg-paper px-3 py-2 text-xs text-ink"
                >
                  {t("week.deviation_entry", {
                    kind: deviationKindLabel(d.kind),
                    date: d.local_date,
                  })}
                  {d.consumed_flex && (
                    // PASTILLE MAISON → `Badge`. `bg-violet-200` était une
                    // pastille fabriquée à la main, donc une couleur choisie
                    // sans état derrière. « Souplesse utilisée » est un LIBELLÉ
                    // sur la ligne (laquelle des souplesses a été consommée), et
                    // pas un verdict: `neutral`. Un ton `positive` féliciterait
                    // un écart, un ton `caution` le reprocherait — le produit ne
                    // fait ni l'un ni l'autre.
                    <Badge tone="neutral" className="ml-2">
                      {t("week.deviation_flex")}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
      </section>

      {/* 7 — THE RAW FACTS, last: the evidence the rest of the page stands on. */}
      <section>
        <SectionLabel className="mb-2">{t("week.facts_title")}</SectionLabel>
        {model.factCount === 0
          ? <p className="text-sm text-ink-soft">{t("week.facts_empty")}</p>
          : (
            // `divide-line` et pas `divide-line-strong`: une règle horizontale À
            // L'INTÉRIEUR d'une liste est le seul emploi légitime de `line`
            // (1,30:1), et ce n'est pas la bordure d'un contrôle.
            <ul className="divide-y divide-line">
              {model.facts.map((f) => (
                <li
                  key={f.id}
                  // `min-w-0` sur l'enfant `flex-1`: sans lui il refuse d'être
                  // plus étroit que son contenu (`min-width: auto`) et un fait
                  // long pousse la ligne au-delà de 320 px.
                  className="flex flex-wrap items-center gap-2 py-2 text-sm"
                >
                  <span className="w-24 shrink-0 text-xs tabular-nums text-ink-soft">
                    {f.local_date}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {f.slot_key ? slotLabel(f.slot_key) : "-"}
                  </span>
                  <span className="min-w-0 flex-1 text-ink">
                    {f.quantity !== null
                      ? `${f.quantity}${f.unit ? ` ${unitLabel(f.unit)}` : ""}`
                      : t("week.facts_logged")}
                  </span>
                  <span className="text-[11px] text-ink-soft">
                    {t(messageKey(`event.source.${f.source}`))}
                  </span>
                  {f.has_media === true && (
                    // PASTILLE MAISON → `Badge tone="neutral"`. « Photo » est un
                    // libellé sur un fait, pas un verdict sur ce fait.
                    <Badge tone="neutral">{t("week.facts_photo")}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * LES SIX MARQUES DE LA GRILLE — DEUX AXES, ET AUCUNE CINQUIÈME COULEUR.
 *
 * ── LE PROBLÈME, ÉNONCÉ ────────────────────────────────────────────────────
 * Le produit n'a QUE quatre familles d'état (`ui/Badge.tsx`): émeraude = ok,
 * bleu = info, ambre = attention, rouge = échec. Cette grille a SIX statuts.
 * Le fichier résolvait l'écart en inventant une cinquième teinte — `violet-300`
 * pour `not_applicable`, `violet-400` pour `flex_used` — c'est-à-dire la marque
 * du produit grand public supprimé, recyclée en faux état. Et `sky` (partial) et
 * `rose` (missed) frôlaient deux familles sans en être: le bleu appartient à
 * `Badge tone="info"`, et `rose-700` n'est qu'à 22° de la teinte de marque.
 *
 * ── LA SORTIE: LA SECONDE DISTINCTION EST UNE FORME, PAS UNE TEINTE ───────
 *   TEINTE = la famille du fait.      émeraude · ambre · rouge · neutre
 *   REMPLISSAGE = ce que la journée devait.
 *       plein   → une obligation existait, et elle a reçu une réponse;
 *       anneau  → créditée ou levée SANS avoir été exécutée;
 *       barre   → aucune obligation à juger (la case est barrée, pas peinte).
 *
 * ── POURQUOI `flex_used` EST DE LA FAMILLE « OK » ─────────────────────────
 * Parce que le MODÈLE le dit déjà, et il le dit en arithmétique: `Highlight`
 * plus bas compte `met: summary.met + summary.flexUsed`. Une souplesse déclarée
 * à l'avance est comptée avec ce qui a tenu — elle sort du dénominateur, pas de
 * la semaine. Elle est donc émeraude, et son ANNEAU dit le reste: créditée,
 * jamais exécutée. C'est une lecture du code, pas une opinion sur le produit.
 *
 * ── POURQUOI `not_applicable` PERD SA COULEUR ─────────────────────────────
 * `status.not_applicable` se lit « Not counted » / « Non compté ». Ce n'est pas
 * un état de l'élève, c'est l'absence d'obligation — exactement ce que
 * `StatusDot` marque déjà d'un tiret quand la ligne n'est pas programmée ce
 * jour-là. Les deux disent la même chose; leur donner la même marque est
 * honnête, et le titre de la case porte la nuance. `unknown` reste le seul
 * neutre PLEIN: là, la journée devait quelque chose et personne n'a répondu.
 *
 * ✅ `KeelBadges.STATUS_TONE` EST ALIGNÉ SUR CETTE TABLE, TEINTE POUR TEINTE.
 * ⚠️ Ce paragraphe décrivait une divergence à réparer, et elle est réparée —
 * réécrit plutôt que supprimé, parce qu'un lecteur qui trouve les deux tables
 * d'accord et un commentaire qui les dit divergentes va « réparer » l'une des
 * deux. Ce qui était vrai: `KeelBadges` portait `not_applicable` et `flex_used`
 * en `violet-100/700` (la marque d'un produit supprimé) et `partial` en `sky`
 * (le bleu qu'occupe `Badge tone="info"`). Il est monté par `CommitmentLine`
 * (TemplatesPage, PlanImportPage, TodayPage), donc le même statut était un
 * anneau émeraude ici et une pastille violette là-bas.
 *
 * L'alignement retenu: `met` et `flex_used` → `positive`, `partial` →
 * `caution`, `missed` → `critical`, `unknown` et `not_applicable` → `neutral`.
 * ⚠️ UN ÉCART SUBSISTE ET IL EST ASSUMÉ: `ui/Badge` n'a ni anneau ni barre,
 * donc là où cette grille sépare `met` de `flex_used` (plein contre creux) et
 * `unknown` de `not_applicable` (plein contre barre) PAR LA GÉOMÉTRIE, la
 * pastille ne peut les séparer que par le MOT (`statusLabel()`). Ajouter un ton
 * au kit pour ça aurait été teindre une nuance que la couleur ne porte pas.
 *
 * La géométrie vit dans la table, pas chez l'appelant: une marque qui n'est pas
 * un disque (la barre) ne peut pas être décrite par une couleur seule, et un
 * `h-*` d'appelant battrait celui de la table (même spécificité, l'ordre de
 * génération tranche).
 */
const DOT_STYLE: Record<EvalStatus, string> = {
  unknown: "h-3 w-3 rounded-full bg-line",
  met: "h-3 w-3 rounded-full bg-emerald-500",
  partial: "h-3 w-3 rounded-full bg-amber-400",
  missed: "h-3 w-3 rounded-full bg-red-500",
  not_applicable: "h-0.5 w-3 rounded-part bg-line-strong",
  flex_used: "h-3 w-3 rounded-full border-2 border-emerald-500",
};

function StatusDot({ cell }: { cell: WeekDayCell }) {
  if (cell.status === null) {
    // No evaluation row. Three different silences, three different marks —
    // collapsing them into one grey square would make "not on the plan" look
    // like "not done".
    if (!cell.scheduled) {
      return (
        <span
          title={`${cell.date} - ${t("week.line_off")}`}
          className="inline-block h-3 w-3 align-middle text-ink-soft"
        >
          -
        </span>
      );
    }
    return (
      <span
        title={`${cell.date} - ${
          cell.isFuture ? t("week.line_future") : t("week.line_no_row")
        }`}
        className={`inline-block h-3 w-3 rounded-full border align-middle ${
          cell.isFuture
            ? "border-dashed border-line-strong"
            : "border-line-strong bg-paper"
        }`}
      />
    );
  }
  const style = DOT_STYLE[cell.status];
  // R7: an unstyled status is a status we did not think about.
  if (!style) throw new Error(`[keel/WeekView] no dot style for "${cell.status}"`);
  return (
    <span
      title={`${cell.date} - ${statusLabel(cell.status)}${
        cell.timingStatus === "off_window" ? ` (${t("timing.off_window")})` : ""
      }`}
      // `align-middle` est ici parce que `not_applicable` est une BARRE de 2 px:
      // un `inline-block` de 2 px de haut s'assiérait sur la ligne de base et la
      // barre tomberait sous les disques de la même colonne.
      className={`inline-block align-middle ${style}`}
    />
  );
}

function Legend() {
  // Every tint that can appear in the grid is named here. A colour on screen
  // with no entry in the legend is a colour the reader has to guess at.
  const shown: EvalStatus[] = [
    "met",
    "partial",
    "missed",
    "flex_used",
    "not_applicable",
    "unknown",
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-ink-soft">
      {shown.map((s) => (
        <span key={s} className="flex items-center gap-1">
          {/* LA LÉGENDE REND LA MARQUE À SA TAILLE RÉELLE (12 px), et elle ne la
              rétrécit plus à 8. Deux des six marques ne sont plus des aplats —
              un anneau de 2 px de contour et une barre de 2 px de haut — et à
              8 px l'anneau se referme en disque: la légende dirait alors
              exactement ce que la grille ne montre pas. La géométrie vient donc
              de `DOT_STYLE`, une seule fois, pour les deux lecteurs. */}
          <span className={`inline-block align-middle ${DOT_STYLE[s]}`} />
          {statusLabel(s)}
        </span>
      ))}
    </div>
  );
}

function Highlight({
  title,
  tone,
  summary,
}: {
  title: string;
  tone: "held" | "dropped";
  summary: WeekLineSummary;
}) {
  // ⛔ LES DEUX TEINTES RESTENT, ET ELLES PORTENT DES FAITS OPPOSÉS: émeraude =
  // ce qui a tenu, ambre = ce qui a glissé. C'est le vocabulaire d'état du
  // produit sur une surface, ce que la charte autorise explicitement. Seul le
  // rayon a suivi le kit (`xl` → `card`, la même valeur, enfin nommée).
  const border = tone === "held"
    ? "border-emerald-200 bg-emerald-50"
    : "border-amber-200 bg-amber-50";
  return (
    <div className={`rounded-card border p-3 ${border}`}>
      <p className="text-[11px] uppercase tracking-wide text-ink-soft">{title}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">
        {summary.line.title}
      </p>
      {/* COUNTS, never a rate: a percentage computed here would be a second
          adherence implementation on the client. */}
      <p className="mt-1 text-xs tabular-nums text-ink-soft">
        {t("week.highlight_counts", {
          met: summary.met + summary.flexUsed,
          partial: summary.partial,
          missed: summary.missed,
        })}
      </p>
    </div>
  );
}

/**
 * UNE MESURE DE LA SEMAINE.
 *
 * ⛔ AUCUNE FIGUE ICI, ET C'EST LA GARDE: un chiffre est un FAIT, la teinte de
 * marque marque la navigation et l'action. Un compteur en `fig-700` rendrait un
 * verdict indistinguable d'un bouton.
 *
 * La tuile maison est partie pour `Card`: elle était `bg-gray-50` sur une page
 * blanche, c'est-à-dire lisible parce qu'elle était PLUS SOMBRE que le fond. Ce
 * levier n'existe plus — le ground est `paper` et la charte ne nomme aucun
 * neutre entre `paper` et `paper-2` — donc la tuile est une case tracée, comme
 * toutes les autres de l'app. `Card` porte déjà ce trait et ce rayon.
 * Public Sans et pas Young Serif: la charte §3 attribue les CHIFFRES à la
 * famille de texte, la display n'a qu'une graisse et ne descend pas sous 20 px.
 */
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="text-xl font-semibold tabular-nums text-ink">{value}</div>
      <div className="mt-0.5 text-xs text-ink-soft">{label}</div>
    </Card>
  );
}

function NavButton({
  label,
  glyph,
  onClick,
  disabled,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
  disabled: boolean;
}) {
  // LE BOUTON MAISON EST PARTI POUR CELUI DU KIT. Il refabriquait `secondary`
  // en moins bon: contour `gray-200` à l'état désactivé (1,24:1, sous le seuil
  // 3:1 de WCAG 1.4.11 pour un composant d'interface), pas de `disabled:opacity`
  // et un survol `bg-white` qui n'existe plus dans la palette. `Button` rend
  // `border-line-strong` (3,84:1), le survol `fig-50` et l'état désactivé une
  // fois pour tout le produit. La cible tactile y gagne aussi: `py-2` contre
  // `py-1`, sur un couple de flèches qu'on vise au pouce.
  return (
    <Button
      variant="secondary"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {glyph}
    </Button>
  );
}

function dayLabel(token: DayToken): string {
  return t(messageKey(`day.${token}`));
}

/**
 * ⚠️ `count === 1` ÉTAIT LA RÈGLE ANGLAISE, ET ELLE EST FAUSSE EN FRANÇAIS.
 * « 0 day » se dit « 0 days » en anglais et « 0 jour » en français — or zéro est
 * une valeur ordinaire de cette série (une semaine sans aucun jour noté). Le
 * choix passe donc par `plural()`, qui porte la seule divergence des deux
 * langues (i18n/plural.ts), et les deux formes viennent de `week.*` depuis que
 * ce composant a cessé d'emprunter son vocabulaire à l'écran de progression.
 */
function dayCount(count: number): string {
  return plural(
    count,
    t("week.day_value", { count }),
    t("week.days_value", { count }),
  );
}
