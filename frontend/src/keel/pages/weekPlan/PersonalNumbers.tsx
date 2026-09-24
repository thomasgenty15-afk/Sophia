// ⟳ 2026-09-24 — SORTI DE `StudentWeekPlanPage.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Les infos de base et les mesures de l'élève.
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import React from "react";

import { Button } from "../../components/ui/Button";
import { inputClass } from "../../components/ui/Field";
import {
  type BodyMeasureRow,
  type DatedMeasure,
  indicatorFor,
  lastMeasuredOn,
  readIndicator,
  type ReviewRow,
  targetValueOf,
  weeklyMeasures,
  weeksInsideBand,
} from "../../api/bodyMeasures";
import type { GoalToken } from "../../../../../supabase/functions/_shared/keel/tokens.ts";
import { formatDate } from "../../i18n/format";
import { plural } from "../../i18n/plural";
import { type MessageKey, t } from "../../i18n/t";
import type { Basics } from "./types.ts";
import { ageFrom, dayLabel, todayIso, weekLabel } from "./dates.ts";
import { CellActions } from "./CellActions.tsx";

/** Les trois valeurs que la base accepte (`profiles_gender_check`). */
const GENDER_VALUES = ["female", "male", "other"] as const;

/** Une FONCTION: une table de module se figerait à la langue du démarrage. */
function genderOptions(): Array<{ value: string; label: string }> {
  return GENDER_VALUES.map((value) => ({
    value,
    label: t(`plan.gender.${value}` as MessageKey),
  }));
}

/**
 * TES INFOS DE BASE — la section qui n'existait pas, et la taille qui
 * n'existait nulle part.
 *
 * ── POURQUOI ELLE EST À PART, ET EN HAUT ──────────────────────────────────
 * La taille et le poids ne sont pas des propriétés d'un OBJECTIF: ce sont des
 * propriétés d'un CORPS. Elles ne changent pas quand on passe de « perdre du
 * poids » à « mieux manger », et elles servent à la même chose dans les deux
 * cas — poser les portions. Les ranger sous l'objectif faisait croire le
 * contraire, et les faisait disparaître pour les deux dynamiques qui n'ont pas
 * de cible chiffrée.
 *
 * ── LE PLANCHER TCA COUVRE CETTE SECTION, PAS LA TAILLE ───────────────────
 * `restriction_flag` retire le poids, le tour de taille et toute lecture de
 * tendance: c'est la garde de `CONTRACT.md`, et cet écran est le seul qui
 * propose de VISER un nombre. La taille reste: elle ne se vise pas, elle ne
 * bouge pas, et elle est nécessaire aux portions de quelqu'un qu'on continue
 * de nourrir.
 */
export function PersonalNumbers(props: {
  goal: GoalToken;
  reviews: ReviewRow[];
  /**
   * FF-031 — les pesées DATÉES, source de vérité depuis ce chantier.
   * `reviews` reste passé: son `biofeedback` comble les semaines antérieures à
   * la reprise, et il porte les six axes, qui ne sont pas des mesures.
   */
  measures: BodyMeasureRow[];
  target: string;
  /**
   * LES TROIS FAITS DURABLES DE LA PERSONNE — taille, naissance, sexe.
   *
   * `draft` est ce qui est TAPÉ, `saved` ce qui est EN BASE. Le récapitulatif
   * ne lit que `saved`: un résumé qui afficherait « 180 cm » parce qu'on vient
   * de le taper dirait que le générateur connaît un chiffre que personne ne lui
   * a donné.
   */
  basics: Basics;
  savedBasics: Basics;
  onBasicsChange: (next: Basics) => void;
  /** Enregistre UN champ. Les trois ne se saisissent jamais ensemble. */
  onSaveBasic: (field: keyof Basics) => void;
  draft: { weight: string; waist: string };
  onDraftChange: (d: { weight: string; waist: string }) => void;
  onSaveMeasures: () => void;
  busy: string | null;
  restricted: boolean;
}) {
  const weights = weeklyMeasures({
    reviews: props.reviews,
    measures: props.measures,
    kind: "weight",
  });
  const waists = weeklyMeasures({
    reviews: props.reviews,
    measures: props.measures,
    kind: "waist",
  });
  // LE JOUR de la dernière pesée, quand on le connaît. L'écran affichait
  // « week of 3 Aug » sous une mesure du vendredi, parce que la case de
  // stockage était la semaine et que la date affichée l'était devenue aussi.
  const lastOn: Record<"weight" | "waist", string | null> = {
    weight: lastMeasuredOn(props.measures, "weight"),
    waist: lastMeasuredOn(props.measures, "waist"),
  };
  const indicator = indicatorFor(props.goal);
  // La conversion vit dans `targetValueOf`, PAS ici: `Number("")` vaut 0, et
  // un champ vide devenait une fourchette centrée sur zéro kilo.
  const targetNumber = targetValueOf(props.target, indicator.target);
  const reading = readIndicator({
    goal: props.goal,
    weights,
    waists,
    targetWeightKg: targetNumber,
  });
  const showsWaist = indicator.primary === "waist" || indicator.secondary === "waist";

  const weeksHeld = indicator.target === "band"
    ? weeksInsideBand(weights, targetNumber)
    : 0;

  /**
   * LA MESURE QUI PORTE L'OBJECTIF PASSE EN PREMIER.
   *
   * Le poids était toujours affiché en tête, y compris en recomposition — où
   * c'est le tour de taille qui décide et où le poids n'est là que pour dire
   * « il tient ». Mettre en premier ce qui compte le moins, c'est enseigner
   * l'inverse de ce que la carte explique juste au-dessus.
   */
  type MeasureCell = {
    which: "weight" | "waist";
    label: string;
    m: DatedMeasure | null;
    unit: string;
  };
  const measureCells: MeasureCell[] = [];
  const weightCell: MeasureCell = {
    which: "weight",
    label: t("plan.measures.weight"),
    m: reading.weight,
    unit: t("unit.kg"),
  };
  const waistCell: MeasureCell = {
    which: "waist",
    label: t("plan.measures.waist"),
    m: reading.waist,
    unit: t("unit.cm"),
  };
  if (indicator.primary === "waist") {
    measureCells.push(waistCell, weightCell);
  } else {
    measureCells.push(weightCell);
    if (showsWaist) measureCells.push(waistCell);
  }
  const recorded = measureCells.filter((r) => r.m !== null);

  /**
   * L'HISTORIQUE, DU PLUS RÉCENT AU PLUS ANCIEN.
   *
   * `weeklyMeasures` rend l'inverse (du plus ancien au plus récent) parce que
   * c'est ce dont les calculs de tendance ont besoin. Un tableau se lit dans
   * l'autre sens: la ligne du haut est celle d'aujourd'hui.
   *
   * L'écart est calculé contre la semaine PESÉE précédente, pas contre la ligne
   * du dessus: une semaine où seul le tour de taille a été saisi ne doit pas
   * faire un écart de poids de zéro.
   */
  const weekKeys = new Set<string>(weights.map((m) => m.weekStart));
  if (showsWaist) waists.forEach((m) => weekKeys.add(m.weekStart));
  const weeksDesc = [...weekKeys].sort().reverse();
  const weightByWeek = new Map(weights.map((m) => [m.weekStart, m.value]));
  const waistByWeek = new Map(waists.map((m) => [m.weekStart, m.value]));
  const history = weeksDesc.map((week, i) => {
    const w = weightByWeek.get(week) ?? null;
    let delta: number | null = null;
    if (w !== null) {
      for (let j = i + 1; j < weeksDesc.length; j += 1) {
        const older = weightByWeek.get(weeksDesc[j]);
        if (older !== undefined) {
          delta = Math.round((w - older) * 10) / 10;
          break;
        }
      }
    }
    return { week, weight: w, waist: waistByWeek.get(week) ?? null, delta };
  });

  /**
   * QUELLE MESURE EST EN COURS D'ÉDITION — une seule à la fois.
   *
   * ── LE DÉFAUT QUE ÇA CORRIGE ───────────────────────────────────────────
   * La section portait un bloc « Update » permanent avec deux à trois champs
   * VIDES en bas, sous le récapitulatif. Des cases vides en permanence sous des
   * chiffres déjà renseignés, ça occupe la moitié de la section pour un geste
   * qu'on fait une fois par semaine — et ça donne l'impression qu'il reste
   * quelque chose à remplir alors que tout est rempli.
   *
   * Chaque mesure porte donc son propre lien, et le champ n'existe que pendant
   * qu'on s'en sert.
   */
  const [editing, setEditing] = React.useState<
    null | "height" | "birthDate" | "gender" | "weight" | "waist"
  >(null);

  /**
   * L'ÉDITEUR SE FERME QUAND LA VALEUR ENREGISTRÉE A CHANGÉ SOUS LUI.
   *
   * Et pas au clic sur « Save »: `run()` avale les erreurs dans la bannière de
   * la page et ne rejette jamais, donc fermer sur le clic fermerait AUSSI sur
   * un échec — l'élève verrait sa saisie disparaître en croyant qu'elle est
   * passée. Ici, ce qui ferme est la preuve que l'écriture a eu lieu: la
   * relecture a rapporté autre chose. Même posture que `EatingRhythmCard`.
   */
  const savedPrint = [
    props.savedBasics.height.trim(),
    props.savedBasics.birthDate.trim(),
    props.savedBasics.gender.trim(),
    reading.weight?.value ?? "",
    reading.waist?.value ?? "",
  ].join("|");
  const [syncedFrom, setSyncedFrom] = React.useState(savedPrint);
  if (syncedFrom !== savedPrint) {
    setSyncedFrom(savedPrint);
    setEditing(null);
  }

  /** Le lien discret qui ouvre une cellule. Même forme pour les cinq. */
  const editLink = (
    which: "height" | "birthDate" | "gender" | "weight" | "waist",
    hasValue: boolean,
  ) => (
    <button
      type="button"
      onClick={() => {
        setEditing(which);
        // Rouvrir sur un brouillon abandonné ferait réenregistrer une valeur
        // que l'élève avait renoncé à poser.
        if (which === "weight" || which === "waist") {
          props.onDraftChange({ ...props.draft, [which]: "" });
        } else {
          props.onBasicsChange({ ...props.savedBasics });
        }
      }}
      className="mt-1 block text-xs font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
    >
      {t(hasValue ? "plan.change" : "plan.add")}
    </button>
  );

  return (
    <div className="space-y-4">
      {/*
        ── CINQ CELLULES, UN SEUL GROUPE ──────────────────────────────────
        Taille, naissance, sexe, poids, tour de taille: cinq faits que l'élève
        donne sur lui-même. Les séparer ferait plusieurs blocs là où il n'y a
        qu'une question.

        Que les trois premiers vivent sur `profiles` et les deux derniers dans
        `weekly_reviews` est une différence de PLOMBERIE. Elle n'a aucune raison
        de se voir à l'écran.

        LES TROIS PREMIERS SURVIVENT AU PLANCHER TCA: ils ne se visent pas, ils
        ne bougent pas, et ils sont nécessaires aux portions de quelqu'un qu'on
        continue de nourrir. Les deux derniers montent et descendent, et cet
        écran est le seul qui propose d'en viser un.
      */}
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        {/* LA TAILLE */}
        <div className="min-w-[7rem]">
          <p className="text-label font-semibold uppercase text-ink-soft">{t("plan.measures.height")}</p>
          {editing === "height" ? (
            <div className="mt-1">
              <div className="flex flex-wrap items-center gap-2">
                {/* Largeur sur le conteneur — voir `GoalTargetField`. */}
                <div className="w-20">
                  <input
                    id="profile-height"
                    className={inputClass}
                    inputMode="decimal"
                    autoFocus
                    value={props.basics.height}
                    placeholder="—"
                    onChange={(e) =>
                      props.onBasicsChange({ ...props.basics, height: e.target.value })}
                  />
                </div>
                <span className="text-sm text-ink-soft">{t("unit.cm")}</span>
              </div>
              <CellActions
                busy={props.busy === "basics"}
                disabled={props.busy !== null}
                onSave={() => props.onSaveBasic("height")}
                onCancel={() => {
                  props.onBasicsChange({ ...props.savedBasics });
                  setEditing(null);
                }}
              />
            </div>
          ) : (
            <>
              <p className="text-lg font-semibold leading-tight text-ink">
                {props.savedBasics.height.trim()
                  ? (
                    <>
                      {props.savedBasics.height.trim()}
                      <span className="ml-1 text-sm font-normal text-ink-soft">
                        {t("unit.cm")}
                      </span>
                    </>
                  )
                  : <span className="text-ink-soft">—</span>}
              </p>
              {editLink("height", props.savedBasics.height.trim() !== "")}
            </>
          )}
        </div>

        {/* L'ÂGE, DÉRIVÉ DE LA DATE. On AFFICHE l'âge — c'est ce qui parle et
            ce dont la composition a besoin — et on SAISIT la date, qui ne se
            périme pas. Stocker l'âge obligerait à le corriger chaque année. */}
        <div className="min-w-[7rem]">
          <p className="text-label font-semibold uppercase text-ink-soft">{t("plan.measures.age")}</p>
          {editing === "birthDate" ? (
            <div className="mt-1">
              <input
                id="profile-birth-date"
                type="date"
                className={inputClass}
                autoFocus
                max={todayIso()}
                value={props.basics.birthDate}
                onChange={(e) =>
                  props.onBasicsChange({ ...props.basics, birthDate: e.target.value })}
              />
              <CellActions
                busy={props.busy === "basics"}
                disabled={props.busy !== null}
                onSave={() => props.onSaveBasic("birthDate")}
                onCancel={() => {
                  props.onBasicsChange({ ...props.savedBasics });
                  setEditing(null);
                }}
              />
            </div>
          ) : (
            <>
              <p className="text-lg font-semibold leading-tight text-ink">
                {ageFrom(props.savedBasics.birthDate) !== null
                  ? ageFrom(props.savedBasics.birthDate)
                  : <span className="text-ink-soft">—</span>}
              </p>
              {props.savedBasics.birthDate.trim() && (
                <p className="text-xs text-ink-soft">
                  {props.savedBasics.birthDate.trim()}
                </p>
              )}
              {editLink("birthDate", props.savedBasics.birthDate.trim() !== "")}
            </>
          )}
        </div>

        {/* LE SEXE — liste fermée, celle que la base accepte
            (`profiles_gender_check`). Un champ libre ici produirait des valeurs
            que le CHECK refuse, donc une erreur SQL que personne ne sait lire. */}
        <div className="min-w-[7rem]">
          <p className="text-label font-semibold uppercase text-ink-soft">{t("plan.measures.sex")}</p>
          {editing === "gender" ? (
            <div className="mt-1">
              <select
                id="profile-gender"
                className={inputClass}
                autoFocus
                value={props.basics.gender}
                onChange={(e) =>
                  props.onBasicsChange({ ...props.basics, gender: e.target.value })}
              >
                <option value="">—</option>
                {genderOptions().map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
              <CellActions
                busy={props.busy === "basics"}
                disabled={props.busy !== null}
                onSave={() => props.onSaveBasic("gender")}
                onCancel={() => {
                  props.onBasicsChange({ ...props.savedBasics });
                  setEditing(null);
                }}
              />
            </div>
          ) : (
            <>
              <p className="text-lg font-semibold leading-tight text-ink">
                {genderOptions().find((g) => g.value === props.savedBasics.gender)?.label ??
                  <span className="text-ink-soft">—</span>}
              </p>
              {editLink("gender", props.savedBasics.gender.trim() !== "")}
            </>
          )}
        </div>

        {/* LE PLANCHER TCA — ces deux-là sont des nombres qui montent et
            descendent, et cet écran est le seul qui propose d'en viser un. */}
        {props.restricted ? null : measureCells.map((cell) => (
          <div key={cell.which} className="min-w-[7rem]">
            <p className="text-label font-semibold uppercase text-ink-soft">{cell.label}</p>
            {editing === cell.which ? (
              <div className="mt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-20">
                    <input
                      id={`measure-${cell.which}`}
                      className={inputClass}
                      inputMode="decimal"
                      autoFocus
                      value={props.draft[cell.which]}
                      placeholder="—"
                      onChange={(e) =>
                        props.onDraftChange({ ...props.draft, [cell.which]: e.target.value })}
                    />
                  </div>
                  <span className="text-sm text-ink-soft">{cell.unit}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    onClick={props.onSaveMeasures}
                    disabled={props.busy !== null}
                    variant="secondary"
                  >
                    {props.busy === "measures" ? t("plan.busy") : t("plan.save")}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      props.onDraftChange({ ...props.draft, [cell.which]: "" });
                      setEditing(null);
                    }}
                    className="text-xs text-fig-700 underline underline-offset-2 hover:text-fig-800"
                  >
                    {t("plan.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-lg font-semibold leading-tight text-ink">
                  {cell.m === null
                    ? <span className="text-ink-soft">—</span>
                    : (
                      <>
                        {cell.m.value}
                        <span className="ml-1 text-sm font-normal text-ink-soft">
                          {cell.unit}
                        </span>
                      </>
                    )}
                </p>
                {/* La date sous la valeur, toujours: « 78 kg » ne dit rien,
                    « 78 kg il y a trois semaines » dit quelque chose. */}
                {cell.m ? (
                  <p className="text-xs text-ink-soft">
                    {/* Le JOUR quand la table datée le connaît, le libellé de
                        semaine sinon — pour une mesure d'avant la reprise, la
                        semaine est la seule chose vraie qu'on puisse dire. */}
                    {dayLabel(lastOn[cell.which]) ?? weekLabel(cell.m.weekStart)}
                  </p>
                ) : null}
                {editLink(cell.which, cell.m !== null)}
              </>
            )}
          </div>
        ))}
      </div>

      {/* ══ ⟳ LOT 5 · LA DATE MANQUANTE, ET CE QU'ELLE COÛTE ══════════════
          Sans `profiles.birth_date`, `goalApplies` (`_shared/keel/household.ts`)
          exige `ageState === "adult"` et n'a pas de quoi le décider: la
          direction est IGNORÉE, et les portions sortent standard sans qu'aucun
          écran ne le dise. Un tiret dans la case « âge » ne raconte pas ça.

          ⛔ ET CETTE PHRASE NE PARLE PAS DE CALORIES, JAMAIS. La porte ②bis
          ferme aussi le chiffre, et `mealEnergy.ts` écrit pourquoi on se tait
          là-dessus: « donne ta date, reçois des calories » se lit comme un
          marchandage. La même décision ajoutait: « le jour où la date se
          redemande, elle se redemandera depuis "about you" » — c'est ici, et
          c'est sur le motif qui se dit sans rien monnayer.

          ⚠️ MÊME PHRASE QUE L'ENTONNOIR (`setup.missing.adult_without_birth_date`),
          importée et pas réécrite: deux formulations du même manque
          divergeraient, et celle qu'on relit le moins garderait l'ancienne.

          ⚠️ ELLE NE S'AFFICHE QU'AVEC UNE DIRECTION. `maintenance` n'a pas de
          direction à perdre, et poser un reproche sous la case de quelqu'un
          qui ne vise rien serait réclamer une donnée pour rien. */}
      {props.savedBasics.birthDate.trim() === "" &&
          (props.goal === "fat_loss" || props.goal === "muscle_gain")
        ? (
          <p className="text-xs leading-5 text-amber-700">
            {t("setup.missing.adult_without_birth_date")}
          </p>
        )
        : null}

      {/* La phrase n'apparaît QUE pendant la saisie: elle explique où va le
          chiffre, ce qui n'intéresse personne le reste du temps. */}
      {!props.restricted && (editing === "weight" || editing === "waist") ? (
        <p className="text-xs leading-5 text-ink-soft">
          {t("plan.measures.since_sunday")}
        </p>
      ) : null}

      {props.restricted ? null : (
      <>
      {recorded.length === 0 ? (
        // ÉTAT VIDE NON HONTEUX, ET QUI DIT D'OÙ VIENNENT LES CHIFFRES.
        <p className="text-sm text-ink-soft">
          {t("plan.measures.none_yet")}
        </p>
      ) : (
        <div>
          {reading.sentence ? (
            <p className="text-sm text-ink">{reading.sentence}</p>
          ) : (
            <p className="text-xs leading-5 text-ink-soft">
              {t("plan.measures.one_more")}
            </p>
          )}

          {/*
            TROIS ÉTATS, ET LE TROISIÈME MANQUAIT.

            « Tu es sorti de ta fourchette » suppose une fourchette. Sans
            référence saisie, `insideBand` vaut `null` et on ne conclut RIEN —
            on dit ce qui manque pour pouvoir conclure. Le cas est fréquent:
            c'est celui de tout élève qui vient de choisir « Hold what I have »
            et n'a pas encore posé son poids de référence.
          */}
          {indicator.target === "band" && targetNumber === null ? (
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              {t("plan.measures.band_unset")}
            </p>
          ) : weeksHeld > 0 ? (
            <p className="mt-1 text-sm text-ink">
              {plural(
                weeksHeld,
                t("plan.measures.weeks_in_range_one", { count: weeksHeld }),
                t("plan.measures.weeks_in_range_many", { count: weeksHeld }),
              )}
            </p>
          ) : reading.insideBand === false ? (
            <p className="mt-1 text-sm text-ink">
              {t("plan.measures.drifted")}
            </p>
          ) : null}
        </div>
      )}

      {/*
        ── L'HISTORIQUE ────────────────────────────────────────────────────
        Une phrase de tendance dit une direction; elle ne montre pas le chemin.
        « Tu as perdu du poids » et douze semaines de chiffres ne se lisent pas
        pareil, et c'est le second qu'on vient chercher quand on doute.

        À PARTIR DE DEUX LIGNES: un tableau d'une ligne est un chiffre déjà
        affiché juste au-dessus, avec une bordure autour.

        AUCUNE COULEUR SUR L'ÉCART, et c'est une règle produit, pas un oubli.
        Du vert sur −0,4 kg et du rouge sur +0,4 serait une NOTE — exactement ce
        que « nobody is scored against it » refuse deux sections plus haut
        (`plan.goal.target_hint`). ⟳ 2026-09-01: la moitié « nothing counts
        down » de cette phrase est PARTIE, parce qu'elle était fausse — la
        cible donne la direction sur laquelle les grammages sont calibrés
        (lot L8). C'est la seconde moitié qui porte la règle ici, et elle tient
        seule. Le signe suffit à lire le sens.
      */}
      {history.length >= 2 ? (
        <div>
          <p className="text-label font-semibold uppercase text-ink-soft">
            {t("plan.measures.week_by_week")}
          </p>
          {/* Le tableau défile DANS son conteneur: à 320 px, trois colonnes
              chiffrées débordent, et c'est la page entière qui partirait de
              travers. */}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[18rem] text-sm">
              <thead>
                <tr className="border-b border-line-strong text-left text-xs text-ink-soft">
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    {t("plan.measures.col_week")}
                  </th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    {t("plan.measures.weight")}
                  </th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    {t("plan.measures.col_change")}
                  </th>
                  {showsWaist ? (
                    <th scope="col" className="py-1.5 font-medium">
                      {t("plan.measures.waist")}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.week} className="border-b border-line last:border-0">
                    <th
                      scope="row"
                      className="whitespace-nowrap py-1.5 pr-3 text-left font-normal text-ink-soft"
                    >
                      {formatDate(h.week, { year: false })}
                    </th>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-ink">
                      {h.weight === null
                        ? <span className="text-ink-soft">—</span>
                        : `${h.weight} ${t("unit.kg")}`}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-ink-soft">
                      {h.delta === null
                        ? <span className="text-ink-soft">—</span>
                        : h.delta === 0
                        ? "="
                        : `${h.delta > 0 ? "+" : ""}${h.delta.toFixed(1)}`}
                    </td>
                    {showsWaist ? (
                      <td className="whitespace-nowrap py-1.5 text-ink">
                        {h.waist === null
                          ? <span className="text-ink-soft">—</span>
                          : `${h.waist} ${t("unit.cm")}`}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      </>
      )}
    </div>
  );
}
