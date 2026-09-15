import React from "react";
import { supabase } from "../../lib/supabase";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Card, SectionLabel } from "../components/ui/Card";
import { flagReasonCopy } from "../copy/flagReasons";
import { formatDateTime } from "../i18n/format";
import type { MessageKey } from "../i18n/t";
import { t } from "../i18n/t";

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
  // NULL après la purge RGPD J+7 de l'élève: la ligne « à rattraper » reste
  // dans le rapport (sinon la semaine relue compterait 2 élèves là où le coach
  // en a lu 3), mais elle perd son identité. `student_purged` dit laquelle.
  student_user_id: string | null;
  student_purged?: boolean;
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

const CONTACT_TONE: Record<string, BadgeTone> = {
  responsive: "positive" as BadgeTone,
  slipping: "caution" as BadgeTone,
  silent: "critical" as BadgeTone,
};

/**
 * L'état de contact, en mots. La pastille rendait le JETON BRUT: un coach
 * lisait « slipping » au milieu de sa liste, c'est-à-dire un identifiant de
 * base de données là où l'écran promet une phrase.
 *
 * ⚠️ MÊME GARDE QUE `flagReasonCopy`, ET POUR LA MÊME RAISON: `t()` LÈVE en DEV
 * sur une clé inconnue, donc on ne lui en demande une que si elle existe. Un
 * `ContactState` neuf ajouté côté moteur retombe sur son jeton — visible,
 * signalable, jamais un écran blanc.
 */
const CONTACT_LABEL: Record<string, MessageKey> = {
  responsive: "coach.weekly.contact.responsive",
  slipping: "coach.weekly.contact.slipping",
  silent: "coach.weekly.contact.silent",
};

function contactLabel(state: string): string {
  if (!Object.prototype.hasOwnProperty.call(CONTACT_LABEL, state)) return state;
  return t(CONTACT_LABEL[state]);
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export default function CoachWeeklyPage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [rows, setRows] = React.useState<SynthesisRow[]>([]);
  const [selected, setSelected] = React.useState<number>(0);
  const [names, setNames] = React.useState<Record<string, string>>({});

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

  // WHO these ids are. `flagged_students` stores user ids and nothing else —
  // it is written by a server job that must not duplicate names into a row it
  // will still be readable from in a year. So the screen resolves them, and it
  // resolves them through `coach_student_directory`: the Tier B view filtered
  // by `coached_student_ids()`, which is exactly "the students this coach still
  // has". A coach who lost a seat stops seeing that name, without this page
  // having to know the rule.
  //
  // Found in QA (2026-08-03): the list showed `b1570000` and the prose above it
  // named "Chen Wei". A coach cannot message an 8-character uuid prefix, and
  // the whole section is called "worth a message".
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("coach_student_directory")
        .select("id, full_name");
      if (error || cancelled) return;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
        const name = (row.full_name ?? "").trim();
        if (row.id && name) map[row.id] = name;
      }
      setNames(map);
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
      <KeelAppShell variant="coach" title={t("coach.weekly.title")}>
        <p className="text-sm text-ink-soft">{t("coach.weekly.loading")}</p>
      </KeelAppShell>
    );
  }
  if (state.kind === "error") {
    return (
      <KeelAppShell variant="coach" title={t("coach.weekly.title")}>
        {/* LE TEXTE SUIT MAINTENANT SA SURFACE. `Card tone="warning"` pose un
            fond `amber-50` et le texte était en `gray-900`/`gray-600` — de
            l'encre neutre sur un aplat d'état, la seule combinaison de l'app où
            l'avertissement était peint SANS que sa phrase le soit. Les trois
            autres bandeaux du coach (`/coach`, `/coach/billing`, `WeekView`)
            écrivent tous en `amber-900`; celui-ci les rejoint.
            ⛔ L'ambre elle-même ne bouge pas: un avertissement porte un fait. */}
        <Card tone="warning">
          <p className="text-sm text-amber-900">{t("coach.weekly.load_error")}</p>
          <p className="mt-1 text-xs text-amber-800">{state.message}</p>
        </Card>
      </KeelAppShell>
    );
  }
  if (!current) {
    return (
      <KeelAppShell variant="coach" title={t("coach.weekly.title")}>
        <Card>
          <p className="max-w-[62ch] text-sm leading-6 text-ink">
            {t("coach.weekly.empty")}
          </p>
        </Card>
      </KeelAppShell>
    );
  }

  const flagged = current.flagged_students ?? [];
  const metrics = current.metrics ?? {};

  return (
    <KeelAppShell variant="coach" title={t("coach.weekly.title")}>
      <div className="space-y-6">
        {/* LE CHOIX DE LA SEMAINE EST UNE NAVIGATION, DONC IL A DROIT À LA
            MARQUE. La règle de couleur de l'app donne la figue aux liens, au lien
            actif du shell et aux gestes; la semaine sélectionnée est exactement
            ça — le « où je suis » d'une série de rapports. Ce n'est pas un état
            du système, donc aucune des quatre familles ne s'y applique, et c'est
            précisément pourquoi `bg-gray-900` ne pouvait pas y rester: le noir
            était un accent de marque qui n'osait pas se nommer.
            `rounded-full` et non `rounded-lg`: le kit réserve le cercle complet
            aux boutons et aux pastilles, et ces pastilles-ci sont des boutons.
            `ring` plutôt qu'une bordure: la sélection ne doit pas décaler la
            ligne d'un pixel quand elle change de pastille. `line-strong`
            (3,84:1) et jamais `line` — WCAG 1.4.11 pour un composant. */}
        {rows.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {rows.map((r, i) => (
              <button
                key={r.id}
                type="button"
                aria-current={i === selected ? "true" : undefined}
                onClick={() => setSelected(i)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium tabular-nums ${
                  i === selected
                    ? "bg-fig-700 text-paper"
                    : "bg-paper text-ink ring-1 ring-line-strong hover:bg-fig-50"
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
            {t("coach.weekly.period", {
              from: current.period_start,
              to: current.period_end,
            })}
          </SectionLabel>
          {/*
            ⚠️ CE PARAGRAPHE EST ANGLAIS PAR CONSTRUCTION, ET C'EST CE QUI TIENT
            `/coach/weekly` HORS DE `PAGE_NAMESPACES`. `narrative` est écrit par
            `renderSynthesisText` (_shared/keel/coach_synthesis.ts), qui LÈVE sur
            toute locale autre que « en », et `coach_synthesis_io.ts` l'appelle
            avec `locale: "en"` en dur. Le reste de l'écran est traduit et
            n'attend que ça.
          */}
          {current.narrative ? (
            <p className="mt-3 max-w-[62ch] whitespace-pre-line text-sm leading-6 text-ink">
              {current.narrative}
            </p>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">
              {t("coach.weekly.narrative_empty")}
            </p>
          )}
        </Card>

        {/* 2. WHO TO REACH — with the reason attached, always. */}
        <Card>
          <SectionLabel>{t("coach.weekly.flagged_title")}</SectionLabel>
          {flagged.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              {t("coach.weekly.flagged_empty")}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {flagged.map((f, i) => (
                <li
                  // Indexé: après une purge RGPD, `student_user_id` est null et
                  // deux comptes supprimés partageraient la même clé React.
                  key={f.student_user_id ?? `purged-${i}`}
                  // ⚠️ `line-strong` ET PAS `line`, alors que la table de
                  // correspondance dit `gray-200 → line`. Cette barre de 2 px
                  // n'est pas un séparateur décoratif entre deux blocs: c'est une
                  // marque DESSINÉE devant chaque élève à rattraper, la seule
                  // chose qui découpe la liste. `line` est à 1,30:1 sur le
                  // papier — elle disparaîtrait, et la section « qui mérite un
                  // message » redeviendrait un paragraphe. `line-strong` = 3,84:1.
                  // Le raisonnement est celui de `ui/Card.tsx`: un trait qu'on
                  // doit voir est un trait de contrôle.
                  className="flex flex-wrap items-center gap-2 border-l-2 border-line-strong pl-4"
                >
                  {f.student_user_id && names[f.student_user_id] ? (
                    <span className="text-sm font-medium text-ink">
                      {names[f.student_user_id]}
                    </span>
                  ) : (
                    // Pas de nom: invitation pas encore acceptée, siège fermé,
                    // ou compte purgé. L'id reste, pour que la ligne demeure
                    // traçable plutôt que muette.
                    <span className="text-xs text-ink-soft">
                      {f.student_user_id
                        ? shortId(f.student_user_id)
                        : t("coach.weekly.deleted_account")}
                    </span>
                  )}
                  <span className="text-sm text-ink">
                    {flagReasonCopy(f.reason_code)}
                  </span>
                  {f.contact_state ? (
                    <Badge tone={CONTACT_TONE[f.contact_state] ?? ("neutral" as BadgeTone)}>
                      {contactLabel(f.contact_state)}
                    </Badge>
                  ) : null}
                  {/*
                    Shown explicitly rather than hidden: "we could not measure"
                    and "they scored badly" look identical when a number is
                    simply absent, and a coach acting on the wrong one of those
                    two will say the wrong thing.
                  */}
                  {f.evidence?.adherence_gated ? (
                    <span className="text-xs text-ink-soft">
                      {t("coach.weekly.no_number")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 3. THE NUMBERS — last, and small. */}
        <Card>
          <SectionLabel>{t("coach.weekly.numbers_title")}</SectionLabel>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {/*
              ⚠️ LES ÉTIQUETTES SONT LES CLÉS BRUTES DU `jsonb`, ET ELLES LE
              RESTENT DANS CE LOT. Le vocabulaire est fermé côté moteur
              (`metricsPayload`, _shared/keel/coach_synthesis.ts): une table
              jeton → mot avec repli sur le jeton, comme `contactLabel`
              ci-dessus, est le geste juste. Il appartient au même lot que le
              `narrative` — celui qui rend cet écran traduisible — et le faire
              seul ne changerait rien à l'écran, qui reste servi en anglais tant
              que `/coach/weekly` n'est pas dans `PAGE_NAMESPACES`.
            */}
            {Object.entries(metrics).map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-ink-soft">{k.replace(/_/g, " ")}</dt>
                {/*
                  A nested block (portions, livability) was printed as raw JSON
                  on one line: it ran past its column and overlapped the
                  neighbouring figure, so the last section of the Monday read
                  was partly unreadable. Broken into words, wrapped, and the
                  cell allowed to shrink (`min-w-0`, without which a grid track
                  refuses to go below its content width).
                */}
                <dd className="break-words text-ink">
                  {v && typeof v === "object"
                    ? Object.entries(v as Record<string, unknown>)
                      .map(([sub, val]) => `${sub.replace(/_/g, " ")} ${String(val)}`)
                      .join(" · ")
                    : String(v)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-ink-soft">
            {t(
              current.delivered_at
                ? "coach.weekly.written_read"
                : "coach.weekly.written",
              { date: formatDateTime(current.generated_at) },
            )}
          </p>
        </Card>
      </div>
    </KeelAppShell>
  );
}
