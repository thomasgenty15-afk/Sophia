import React from "react";

import {
  type ActivitySessionRow,
  deleteActivitySession,
  loadActivitySessions,
  logActivitySession,
  toSummaryInputs,
} from "../api/activitySessions";
import {
  ACTIVITY_INTENSITIES,
  ACTIVITY_SESSION_KINDS,
  ACTIVITY_SESSION_MAX_MINUTES,
  ACTIVITY_SESSION_MIN_MINUTES,
  type ActivityIntensity,
  type ActivitySessionKind,
  renderWeekActivityFact,
  summarizeWeekActivity,
} from "../../../../supabase/functions/_shared/keel/activity_session.ts";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import { Field, inputClass } from "./ui/Field";
import { plural } from "../i18n/plural";
import { type MessageKey, t } from "../i18n/t";

/**
 * L2b — LE CONSOMMATEUR VIVANT DU LOG DE SÉANCE, ET SA SURFACE DE SAISIE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE CARTE EST SUR `/app/progress` ET PAS AILLEURS
 * ═══════════════════════════════════════════════════════════════════════════
 * Le lot L2 avait branché `student_activity_sessions` sur le BILAN HEBDO. Ce
 * consommateur est condamné: `docs/keel/RETRAIT-POINT-DU-DIMANCHE.md` (décision
 * produit du 2026-08-10) écrit « le bilan hebdo part aussi », et son unique
 * déclencheur — le cron `keel-weekly-flow` — comptait 270 exécutions et 270
 * échecs avant d'être désactivé en local le 2026-08-18. La table était donc
 * lue par du code juste, qu'aucun appelant n'atteignait jamais.
 *
 * `/app/progress` est le domaine `suivi-quotidien`: c'est là que vivent déjà les
 * observations datées qu'une personne fait d'elle-même (FF-031,
 * `student_body_measures`). Une séance est le même genre d'objet — un fait daté,
 * déclaré par la personne, qu'aucun générateur ne consomme.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ LE FAIT, JAMAIS LE DÉRIVÉ — ET LE CALCUL N'EST PAS RÉÉCRIT ICI
 * ═══════════════════════════════════════════════════════════════════════════
 * `summarizeWeekActivity` est le module partagé, celui-là même que le bilan
 * exécute. Recopier ses règles côté écran ferait le défaut que ce dépôt connaît
 * par cœur — deux implémentations d'accord jusqu'au jour où l'une change, et un
 * écran qui devient MENTEUR.
 *
 * ⚠️ ET `renderWeekActivityFact` EST UTILISÉ COMME **PORTE**, PAS COMME PHRASE.
 * Il tient l'invariant qui compte — « zéro ne s'imprime jamais, et `null` n'est
 * pas zéro » — et c'est CET invariant qui décide ici si la carte affiche un
 * compte ou sa phrase d'absence. Ce qu'on n'emprunte pas est sa CHAÎNE: elle est
 * anglaise en dur (le module part au modèle, où la langue de contenu est celle
 * du prompt), et `/app/progress` est une page DÉCLARÉE traduisible — y rendre un
 * littéral anglais serait exactement la couture que `t()` lève en DEV. La règle
 * vient donc du module, les mots viennent du seed, et il n'y a pas deux règles.
 *
 * ⛔ AUCUNE KCAL SUR CE CHEMIN. La raison est chiffrée dans l'en-tête de
 * `20260818180000_a_session_is_a_fact_not_an_energy.sql`, et elle est rendue à
 * l'élève en note de bas de carte plutôt que gardée pour nous.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ LA PORTE DE CHARGEMENT, ET LE DÉFAUT QU'ELLE FERME
 * ═══════════════════════════════════════════════════════════════════════════
 * « Un formulaire figé au montage sans porte de chargement affiche du vide non
 * lu, puis l'écrase à l'enregistrement. » Ici le champ semé par une lecture est
 * LA DATE: son défaut est « aujourd'hui DANS LE FUSEAU DE L'ÉLÈVE », et ce fuseau
 * vient de `profiles.timezone`. Un montage avant cette lecture daterait la séance
 * dans le fuseau du NAVIGATEUR — un jour d'écart pour tout élève décalé, sur la
 * colonne dont dépend le regroupement par semaine.
 *
 * La porte est double, et les deux moitiés comptent:
 *   1. le parent ne rend cette carte que dans sa branche `ready`, c'est-à-dire
 *      APRÈS la lecture du fuseau (`StudentProgressPage`, garde `state.kind`);
 *   2. cette carte-ci refuse de rendre son formulaire tant que `today` est vide
 *      OU que ses propres lignes ne sont pas lues. Une garde qui dépend
 *      uniquement de la discipline de l'appelant n'est pas une garde.
 */

/** Ce que le parent a déjà résolu, et que cette carte ne recalcule pas. */
export interface ActivitySessionsCardProps {
  userId: string;
  /** Aujourd'hui, dans le fuseau de l'élève (`YYYY-MM-DD`). Jamais celui du navigateur. */
  today: string;
  /** La borne basse de la fenêtre affichée, même fuseau. */
  since: string;
  /**
   * Les jours de la fenêtre, dans l'ordre. C'est le MÊME tableau que la grille
   * de rythme: le compte doit borner la fenêtre qu'il ANNONCE, sinon la carte
   * porte un nombre que ses propres dates ne justifient pas.
   */
  windowDates: readonly string[];
  /** Le nom d'un jour, tel que la page le formate déjà (`i18n/format.ts`). */
  dayName: (iso: string) => string;
}

function kindLabel(kind: string): string {
  return (ACTIVITY_SESSION_KINDS as readonly string[]).includes(kind)
    ? t(`student_progress.activity.kind.${kind}` as MessageKey)
    : kind;
}

function intensityLabel(intensity: string): string {
  return t(`student_progress.activity.intensity.${intensity}` as MessageKey);
}

export function ActivitySessionsCard(props: ActivitySessionsCardProps) {
  const { userId, today, since, windowDates, dayName } = props;

  const [rows, setRows] = React.useState<ActivitySessionRow[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  /** Bump après chaque écriture: la carte relit SES lignes, pas toute la page. */
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const loaded = await loadActivitySessions({
          userId,
          since,
          // La borne haute est « aujourd'hui chez l'élève »: sans elle, une ligne
          // datée dans le futur entrerait dans le compte sans pouvoir s'afficher.
          until: today,
        });
        if (!cancelled) setRows(loaded);
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, since, today, nonce]);

  const summary = React.useMemo(
    () => (rows === null ? null : summarizeWeekActivity(toSummaryInputs(rows), windowDates)),
    [rows, windowDates],
  );

  // ⚠️ LA PORTE DU MODULE, ET PAS UNE SECONDE RÈGLE D'ÉCRAN. `null` (rien lu)
  // et `0 séance` rendent tous les deux `null` ici, et c'est ce qui interdit
  // d'imprimer un zéro. Voir l'en-tête pour pourquoi la CHAÎNE n'est pas rendue.
  const hasFact = renderWeekActivityFact(summary) !== null;

  // Les lignes VRAIMENT dans la fenêtre annoncée, du plus récent au plus ancien:
  // un journal se lit par le haut. Le filtre est le même ensemble de dates que
  // le résumé, sinon la liste et le compte se contrediraient à l'écran.
  const windowSet = React.useMemo(() => new Set(windowDates), [windowDates]);
  const listed = React.useMemo(
    () =>
      (rows ?? [])
        .filter((r) => windowSet.has(r.local_date))
        .slice()
        .sort((a, b) => b.local_date.localeCompare(a.local_date)),
    [rows, windowSet],
  );

  const intensityList = summary === null ? [] : (
    [
      ...ACTIVITY_INTENSITIES.map((band) => ({
        label: intensityLabel(band),
        count: summary.byIntensity[band],
      })),
      // `undeclared` EST UN COMPTE COMME LES AUTRES, pas un trou. Le module le
      // porte en clair et l'écran ne le fait pas disparaître.
      { label: intensityLabel("undeclared"), count: summary.byIntensity.undeclared },
    ].filter((entry) => entry.count > 0)
  );

  return (
    <Card>
      <SectionLabel>{t("student_progress.activity.label")}</SectionLabel>

      {rows === null
        ? <p className="mt-2 text-sm text-ink-soft">{t("student_progress.loading")}</p>
        : (
          <>
            {loadError
              ? (
                <p className="mt-2 text-sm text-red-700">
                  {t("student_progress.error")}
                </p>
              )
              : null}

            {!hasFact || summary === null
              ? (
                <p className="mt-2 text-sm text-ink-soft">
                  {t("student_progress.activity.empty")}
                </p>
              )
              : (
                <div className="mt-3 space-y-2 text-sm text-ink">
                  {/* LES DEUX NOMBRES PORTENT LE GRAS, donc deux fragments qui
                      s'accordent CHACUN avec leur compte — même construction que
                      la carte alimentaire, et pour la même raison: en français
                      « 1 séance sur 1 jour » et « 3 séances sur 2 jours ». */}
                  <p>
                    <span className="font-medium">
                      {plural(
                        summary.sessions,
                        t("student_progress.activity.sessions_one", { count: summary.sessions }),
                        t("student_progress.activity.sessions_many", { count: summary.sessions }),
                      )}
                    </span>{" "}
                    {t("student_progress.activity.across")}{" "}
                    <span className="font-medium">
                      {plural(
                        summary.days,
                        t("student_progress.activity.days_one", { count: summary.days }),
                        t("student_progress.activity.days_many", { count: summary.days }),
                      )}
                    </span>.
                  </p>
                  {/* ⚠️ LA SOMME NE SORT JAMAIS SANS SON DÉNOMINATEUR. Des
                      minutes additionnées sur des séances dont la moitié n'en
                      portait pas est un nombre qui ment par défaut — même
                      famille que « 82 lignes d'huile sans quantité ». */}
                  {summary.minutesFrom > 0
                    ? (
                      <p className="text-ink-soft">
                        {t("student_progress.activity.minutes", {
                          minutes: summary.minutes,
                          from: summary.minutesFrom,
                        })}
                      </p>
                    )
                    : null}
                  {intensityList.length > 0
                    ? (
                      <p className="text-ink-soft">
                        {t("student_progress.activity.by_intensity", {
                          list: intensityList.map((e) => `${e.label} ×${e.count}`).join(" · "),
                        })}
                      </p>
                    )
                    : null}
                </div>
              )}

            {listed.length > 0
              ? (
                <ul className="mt-4 space-y-2 border-t border-line pt-3">
                  {listed.map((row) => (
                    <SessionLine
                      key={row.id}
                      row={row}
                      userId={userId}
                      dayName={dayName}
                      onRemoved={() => setNonce((n) => n + 1)}
                    />
                  ))}
                </ul>
              )
              : null}

            <SessionForm
              userId={userId}
              today={today}
              since={since}
              onSaved={() => setNonce((n) => n + 1)}
            />

            <p className="mt-3 text-xs leading-5 text-ink-soft">
              {t("student_progress.activity.footnote")}
            </p>
          </>
        )}
    </Card>
  );
}

/**
 * Une séance, et le geste qui la retire.
 *
 * ⚠️ RETIRER, ET PAS CORRIGER. La table n'accorde pas `update` à
 * `authenticated` — c'est écrit dans la migration, avec sa raison: « une séance
 * mal saisie se retire et se re-logue », et accorder `update` ouvrirait une
 * surface dont personne ne porte la garde.
 */
function SessionLine(props: {
  row: ActivitySessionRow;
  userId: string;
  dayName: (iso: string) => string;
  onRemoved: () => void;
}) {
  const { row, userId, dayName, onRemoved } = props;
  const [removing, setRemoving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const bits: string[] = [kindLabel(row.kind)];
  if (row.duration_min !== null && row.duration_min !== undefined) {
    bits.push(t("student_progress.activity.duration", { count: row.duration_min }));
  }
  if (row.intensity) bits.push(intensityLabel(row.intensity));

  return (
    <li className="flex items-start justify-between gap-3">
      <div className="min-w-0 text-sm text-ink">
        <p>
          <span className="text-ink-soft">{dayName(row.local_date)}</span> —{" "}
          {bits.join(" · ")}
        </p>
        {/* LE REFUS EST RENDU À CÔTÉ DU GESTE. « Un refus loin du geste se lit
            comme un bouton mort » — trois fois dans `SetupPage` avant qu'on le
            voie. */}
        {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={removing}
        onClick={async () => {
          setRemoving(true);
          setError(null);
          try {
            await deleteActivitySession({ userId, id: row.id });
            onRemoved();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setRemoving(false);
          }
        }}
      >
        {removing
          ? t("student_progress.activity.removing")
          : t("student_progress.activity.remove")}
      </Button>
    </li>
  );
}

/**
 * LA SAISIE — un type, un jour, et deux champs FACULTATIFS.
 *
 * ⚠️ `duration_min` ET `intensity` NE SONT PAS OBLIGATOIRES, et ce n'est pas du
 * confort: ils sont nullables en base pour cette raison exacte — déclarés,
 * jamais devinés. Un champ obligatoire ferait inventer un nombre, et l'inventé
 * entrerait ensuite dans une somme avec l'autorité d'une mesure.
 *
 * ⚠️ LES BORNES DE MINUTES SONT CELLES DU `CHECK` SQL, importées et non
 * recopiées: un écran qui accepterait ce que la base refuse ferait saisir dans
 * le vide, et l'erreur remontée serait un `23514` illisible.
 */
function SessionForm(props: {
  userId: string;
  today: string;
  since: string;
  onSaved: () => void;
}) {
  const { userId, today, since, onSaved } = props;
  // LE DÉFAUT DE LA DATE EST SEMÉ PAR UNE LECTURE (le fuseau du profil), donc ce
  // composant ne doit pas exister avant elle — voir la porte de chargement en
  // en-tête de fichier. Le montage capture `today` UNE fois, ce qui est correct
  // parce que le parent ne monte cette carte qu'après la lecture.
  const [localDate, setLocalDate] = React.useState(today);
  const [kind, setKind] = React.useState<ActivitySessionKind | "">("");
  const [duration, setDuration] = React.useState("");
  const [intensity, setIntensity] = React.useState<ActivityIntensity | "">("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ⚠️ LA GARDE DE MONTAGE, ET ELLE NE DÉPEND PAS DE LA DISCIPLINE DU PARENT.
  // Sans date résolue il n'y a pas de formulaire: un champ vide serait accepté
  // par le navigateur et partirait en `local_date` illisible.
  if (!today) return null;

  const durationValue = duration.trim();
  const durationNumber = durationValue === "" ? null : Number(durationValue);
  const durationBad = durationNumber !== null && (
    !Number.isInteger(durationNumber) ||
    durationNumber < ACTIVITY_SESSION_MIN_MINUTES ||
    durationNumber > ACTIVITY_SESSION_MAX_MINUTES
  );

  return (
    <form
      className="mt-4 space-y-3 border-t border-line pt-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (kind === "" || durationBad || saving) return;
        setSaving(true);
        setError(null);
        try {
          await logActivitySession({
            userId,
            localDate,
            kind,
            durationMin: durationNumber,
            intensity: intensity === "" ? null : intensity,
          });
          // Le formulaire se vide de ce qui a été DÉCLARÉ, et garde le jour: on
          // logue souvent deux séances du même jour d'affilée.
          setKind("");
          setDuration("");
          setIntensity("");
          onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className="text-label font-semibold uppercase text-ink-soft">
        {t("student_progress.activity.form.label")}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("student_progress.activity.form.date")} htmlFor="activity-date">
          <input
            id="activity-date"
            type="date"
            className={inputClass}
            value={localDate}
            min={since}
            max={today}
            onChange={(e) => setLocalDate(e.target.value)}
          />
        </Field>

        <Field label={t("student_progress.activity.form.kind")} htmlFor="activity-kind">
          <select
            id="activity-kind"
            className={inputClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as ActivitySessionKind | "")}
          >
            <option value="">{t("student_progress.activity.form.kind_placeholder")}</option>
            {ACTIVITY_SESSION_KINDS.map((token) => (
              <option key={token} value={token}>{kindLabel(token)}</option>
            ))}
          </select>
        </Field>

        <Field
          label={t("student_progress.activity.form.duration")}
          htmlFor="activity-duration"
          error={durationBad
            ? t("student_progress.activity.form.duration_range", {
              min: ACTIVITY_SESSION_MIN_MINUTES,
              max: ACTIVITY_SESSION_MAX_MINUTES,
            })
            : undefined}
        >
          <input
            id="activity-duration"
            type="number"
            inputMode="numeric"
            className={inputClass}
            placeholder={t("student_progress.activity.form.duration_placeholder")}
            min={ACTIVITY_SESSION_MIN_MINUTES}
            max={ACTIVITY_SESSION_MAX_MINUTES}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </Field>

        <Field
          label={t("student_progress.activity.form.intensity")}
          htmlFor="activity-intensity"
        >
          <select
            id="activity-intensity"
            className={inputClass}
            value={intensity}
            onChange={(e) => setIntensity(e.target.value as ActivityIntensity | "")}
          >
            {/* « Je ne dis pas » EST LA PREMIÈRE OPTION ET LE DÉFAUT: une
                intensité non déclarée est une valeur, pas un oubli à combler. */}
            <option value="">{t("student_progress.activity.form.intensity_none")}</option>
            {ACTIVITY_INTENSITIES.map((token) => (
              <option key={token} value={token}>{intensityLabel(token)}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={kind === "" || durationBad || saving}>
          {saving
            ? t("student_progress.activity.form.saving")
            : t("student_progress.activity.form.submit")}
        </Button>
      </div>

      {/* LE REFUS EST RENDU À CÔTÉ DU GESTE, jamais en haut de page. */}
      {error
        ? (
          <p className="text-sm text-red-700">
            {t("student_progress.activity.form.error", { message: error })}
          </p>
        )
        : null}
    </form>
  );
}

export default ActivitySessionsCard;
