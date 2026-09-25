import React from "react";
import { ChevronDown, X } from "lucide-react";

import {
  type CookingSessionCount,
  type GroceryRunsAnswer,
  type SessionTimeBound,
} from "../api/cookingPlan";
import { addDays, isIsoDate } from "../api/dates";
import {
  hasFreezerDeclared,
  readKitchenEquipment,
} from "../api/kitchenEquipment";
import { type EatingOccasionSlot } from "../api/mealGeneration";
import {
  MAX_WINDOW_DAYS,
  planEndsOn,
  resolveRequestedWindow,
} from "../api/mealWindow";
import {
  BUDGET_MAX,
  type BudgetScale,
  type BudgetVerdict,
  clampToBudgetScale,
} from "../api/planBudget";
import { ENVY_MAX_CHARS } from "../api/household";
import type { PracticalConstraints } from "../api/practicalConstraints";
import { formatBudgetAmount, formatDate, formatPrice } from "../i18n/format";
import { plural } from "../i18n/plural";
import { t } from "../i18n/t";
import { type AwayMark } from "../lib/presenceMarks";
import {
  awayMomentsIn,
  clearWindow,
  isAwayAllWindow,
  markAwayAllWindow,
} from "../lib/presenceAbsence";
import { browserLocalDate, catchUpWindowStart } from "../lib/useMealTicks";
import { presenceMealsPerDay, useOfferedAnswer } from "../lib/cookingAnswers";
import CookingSessionsField from "./CookingSessionsField";
import GroceryRunsField from "./GroceryRunsField";
import KitchenEquipmentCard from "./KitchenEquipmentCard";
import { kitchenToolLabel } from "./kitchenToolLabel";
import MealPickerGrid from "./MealPickerGrid";
import SessionTimeField from "./SessionTimeField";
import { Button } from "./ui/Button";
import { Field, inputClass } from "./ui/Field";

// ══════════════════════════════════════════════════════════════════════════
// LA DEMANDE DE PLAN — UN SEUL FORMULAIRE, MONTÉ PAR LES DEUX ÉCRANS
// (2026-09-23)
// ══════════════════════════════════════════════════════════════════════════
//
// Demandé: « dans l'onboarding et dans le plan de la semaine, ce sont censé
// être les mêmes interfaces — quand on change dans l'un ça doit changer dans
// l'autre ». Les deux écrans (`SetupPage#RequestStep`, étape 3, et
// `MealBuilder`, `/app/plan`) portaient chacun leur copie des mêmes champs, et
// elles avaient déjà divergé: pastilles par personne d'un côté, lignes avec
// leur état de l'autre; inventaire de cuisine en carte à part d'un côté,
// replié dans le formulaire de l'autre.
//
// Ce composant rend LES CHAMPS, dans cet ordre: les dates, « Avec quoi tu
// cuisines » (replié), « Qui mange à la maison », « combien de fois » et le
// temps par session (⟳ 2026-09-25, à la place du style et de « tout en une
// fois »), les courses, le budget, l'envie. Chaque écran garde ce qui
// l'entoure — sa carte, ses boutons, ses refus — et ses propres états: les
// valeurs arrivent par les props, les écritures partent par les callbacks.
//
// ⛔ LES JOURS « TRADITION » N'ENTRENT PAS ICI. Décision produit: ils restent
// dans la fiche du foyer (`HouseholdTraditionsCard`, `/app/household`).

/** Une personne dans « Qui mange à la maison ». */
export interface PresenceRow {
  key: string;
  name: string;
  /** Ses moments d'une journée — les lignes de sa grille. Jamais `[]` si elle mange. */
  slots: readonly EatingOccasionSlot[];
  /** Ce que SA colonne porte déjà (le titulaire et les autres n'écrivent pas au même endroit). */
  away: readonly AwayMark[];
  /** Écrit la liste complète. Rejette en cas d'échec: le refus se lit sous la liste. */
  save: (next: AwayMark[]) => Promise<void>;
}

export interface PlanRequestFieldsProps {
  /** Préfixe des `id` de champ: deux écrans, deux familles d'`id`. */
  idPrefix: string;
  disabled: boolean;

  windowStart: string;
  windowEnd: string;
  onWindowStart: (iso: string) => void;
  onWindowEnd: (iso: string) => void;
  /** Les jours de la fenêtre en jetons (`mon`…`sun`) et leurs dates, même ordre. */
  days: { tokens: readonly string[]; dates: readonly string[] };

  /** `null` = pas encore lu: la carte d'équipement ne rend alors aucun contrôle. */
  practicalConstraints: PracticalConstraints | null;
  hasGoal: boolean;
  onEquipmentSaved: () => void | Promise<void>;

  presence: readonly PresenceRow[];

  /**
   * ⟳ 2026-09-25 — « COMBIEN DE FOIS TU VEUX CUISINER ». Une réponse DE PLAN:
   * l'écran la garde pour la composition, elle ne s'enregistre pas.
   */
  cookingSessions: CookingSessionCount | null;
  onCookingSessions: (next: CookingSessionCount | null) => void;
  /** ⟳ 2026-09-25 — la plage de temps, par sa borne haute (`cooking_time_min`). */
  sessionTime: SessionTimeBound | null;
  onSessionTime: (next: SessionTimeBound | null) => void;
  /**
   * LE LANCEMENT A ÉTÉ REFUSÉ SUR CES DEUX RÉPONSES. Les lignes rouges se
   * lisent sous les champs, à l'endroit où on lève le refus, et meurent avec
   * leur cause. REQUIS: un défaut à `false` ferait un bouton mort.
   */
  showCookingMisses: boolean;
  groceryRuns: GroceryRunsAnswer | null;
  onGroceryRuns: (next: GroceryRunsAnswer | null) => void;

  /** Ce que le champ porte, tel que tapé. */
  budget: string;
  onBudget: (raw: string) => void;
  /** Calculé par l'écran: les bouches et leurs absences n'y arrivent pas de la même façon. */
  budgetVerdict: BudgetVerdict;
  /**
   * ⟳ 2026-09-25 — LE CURSEUR: bas, haut, pas et monnaie (`budgetScaleFor`).
   * `null` hors de France et des États-Unis, ou tant que les bouches ne sont
   * pas lues: le champ libre revient.
   */
  budgetScale: BudgetScale | null;

  showEnvy: boolean;
  envy: string;
  onEnvy: (value: string) => void;
}

export default function PlanRequestFields(props: PlanRequestFieldsProps) {
  const id = (name: string) => `${props.idPrefix}-${name}`;

  // CE QUI EST TAPÉ N'EST PAS ENCORE UNE DATE. Un `<input type="date">` passe
  // par des valeurs vides ou incomplètes; les écrire dans la fenêtre ferait
  // jeter `assertIsoDate` pendant le rendu. Le brouillon porte ce qui est
  // tapé, la fenêtre ce qui est valide.
  const [startDraft, setStartDraft] = React.useState(props.windowStart);
  const [endDraft, setEndDraft] = React.useState(props.windowEnd);
  React.useEffect(() => setStartDraft(props.windowStart), [props.windowStart]);
  React.useEffect(() => setEndDraft(props.windowEnd), [props.windowEnd]);

  const windowPreview = React.useMemo(() => {
    try {
      const w = resolveRequestedWindow(
        { kind: "exact", startsOn: props.windowStart, durationDays: props.days.tokens.length },
        browserLocalDate(),
      );
      if (w.durationDays === 1) return t("meals.form.window_one_day");
      return t("meals.form.window_span")
        .replace("{from}", formatDate(w.startsOn, { year: false }))
        .replace("{to}", formatDate(planEndsOn(w.startsOn, w.durationDays), { year: false }))
        .replace(
          "{days}",
          plural(
            w.durationDays,
            t("meals.form.window_days_one"),
            t("meals.form.window_days_other"),
          ).replace("{n}", String(w.durationDays)),
        );
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [props.windowStart, props.days.tokens.length]);

  // « Pas de congélateur » et « jamais demandé » rendent le même `false`: la
  // même fonction que le moteur (`api/freezerMirror.int.test.ts`).
  const tools = readKitchenEquipment(props.practicalConstraints);
  const hasFreezer = hasFreezerDeclared(tools);
  const equipmentSummary = (tools ?? []).map(kitchenToolLabel).join(" · ");
  // ⟳ 2026-09-24 — SANS CUISINE DÉCLARÉE, PAS DE PLAN. Demandé: « bloquer la
  // génération si "Avec quoi tu cuisines" n'a pas été renseigné ». Chaque
  // écran retient son propre geste (`canGenerate` à l'étape 3, `build` sur
  // `/app/plan`); ici se lit la raison, À L'ENDROIT OÙ ON LA LÈVE: le bloc
  // s'ouvre seul et dit ce qui manque. Rien tant que la colonne n'est pas lue:
  // « pas encore lu » n'est pas « rien de coché ».
  const equipmentMissing = props.practicalConstraints !== null && tools === null;

  return (
    <>
      {/* ── LA FENÊTRE: UNE DATE DE DÉBUT, UNE DATE DE FIN ─────────────────
          Sept jours au plus: c'est la borne de la base (`duration_days
          between 1 and 7`), portée par le `max` du second champ. */}
      <Field label={t("meals.form.window_label")} htmlFor={id("window")}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor={id("window")}
              className="block text-label font-semibold uppercase text-ink-soft"
            >
              {t("meals.form.window_from")}
            </label>
            <input
              id={id("window")}
              type="date"
              // Pas de départ dans le passé: `resolveRequestedWindow` le
              // refuserait (400 `bad_window`) après un aller-retour.
              min={browserLocalDate()}
              value={startDraft}
              disabled={props.disabled}
              onChange={(e) => {
                const typed = e.target.value;
                if (!isIsoDate(typed)) {
                  setStartDraft(typed);
                  return;
                }
                // `catchUpWindowStart` ne corrige QUE le passé; le champ
                // montre le déplacement.
                const clamped = catchUpWindowStart(typed, browserLocalDate());
                setStartDraft(clamped);
                props.onWindowStart(clamped);
              }}
              className={`${inputClass} mt-1 w-auto`}
            />
          </div>
          <div>
            <label
              htmlFor={id("window-end")}
              className="block text-label font-semibold uppercase text-ink-soft"
            >
              {t("meals.form.window_to")}
            </label>
            <input
              id={id("window-end")}
              type="date"
              min={props.windowStart}
              max={addDays(props.windowStart, MAX_WINDOW_DAYS - 1)}
              value={endDraft}
              disabled={props.disabled}
              onChange={(e) => {
                const typed = e.target.value;
                setEndDraft(typed);
                if (isIsoDate(typed)) props.onWindowEnd(typed);
              }}
              className={`${inputClass} mt-1 w-auto`}
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-ink-soft">{windowPreview}</p>
      </Field>

      {/* ── AVEC QUOI TU CUISINES — REPLIÉ, ET AVANT « TOUT EN UNE FOIS » ──
          La case « tout cuisiner en une seule fois » se grise sans
          congélateur et renvoie ici: le remède doit être au-dessus du refus.
          Fermée, la carte dit quand même ce qu'elle contient (les outils
          déclarés dans le titre). `<details>` natif: rien à se rappeler d'un
          rendu à l'autre.

          ⛔ C'EST LA MÊME CARTE, jamais une copie: elle porte sa garde de
          chargement, son refus de sélection vide, et son écriture qui relit
          la colonne avant de fusionner. */}
      {/* ⚠️ `open` N'EST POSÉ QUE PAR LE MANQUE: ouvert tant que rien n'est
          déclaré, il se replie de lui-même à l'enregistrement, et le résumé
          prend alors la liste des outils. L'`id` sert au refus de
          `/app/plan`, qui y emmène le clic. */}
      <details
        id={id("equipment")}
        open={equipmentMissing || undefined}
        className={`group rounded-card border bg-paper p-4 ${
          equipmentMissing ? "border-red-300" : "border-line-strong"
        }`}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-label font-semibold uppercase text-ink-soft">
              {t("setup.equipment.title")}
            </span>
            {equipmentSummary !== "" && (
              <span className="text-xs text-ink-soft">{equipmentSummary}</span>
            )}
            {equipmentMissing && (
              <span className="basis-full text-xs font-medium text-red-700">
                {t("plan.request.equipment_required")}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden
            className="h-4 w-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="mt-4">
          <KitchenEquipmentCard
            embedded
            practicalConstraints={props.practicalConstraints}
            hasGoal={props.hasGoal}
            onSaved={props.onEquipmentSaved}
          />
        </div>
      </details>

      <PresenceList
        rows={props.presence}
        days={props.days}
        disabled={props.disabled}
      />

      <div className="border-t border-line" />

      {/* ⟳ 2026-09-25 — COMBIEN DE FOIS, PUIS COMBIEN DE TEMPS À SA DROITE,
          PUIS LES COURSES. Le nombre de sessions borne le temps (une session
          qui couvre sept jours ne tient pas en trente minutes) et les courses
          (pas plus de passages au magasin que de sessions): on lit les causes
          avant les effets. `cookingSessionsField.int.test.ts` lit cet ordre. */}
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        <CookingSessionsField
          id={id("cooking-sessions")}
          value={props.cookingSessions}
          onChange={props.onCookingSessions}
          disabled={props.disabled}
          daysToEat={props.days.tokens.length}
          freezer={hasFreezer}
          showMissing={props.showCookingMisses}
        />
        <SessionTimeField
          id={id("session-time")}
          value={props.sessionTime}
          onChange={props.onSessionTime}
          disabled={props.disabled}
          daysToEat={props.days.tokens.length}
          sessions={props.cookingSessions}
          mealsPerDay={presenceMealsPerDay(props.presence)}
          showMissing={props.showCookingMisses}
        />
      </div>

      <GroceryRunsField
        id={id("grocery-runs")}
        value={props.groceryRuns}
        onChange={props.onGroceryRuns}
        disabled={props.disabled}
        sessions={props.cookingSessions}
        daysToEat={props.days.tokens.length}
        freezer={hasFreezer}
      />

      <BudgetField
        id={id("budget")}
        disabled={props.disabled}
        budget={props.budget}
        onBudget={props.onBudget}
        budgetVerdict={props.budgetVerdict}
        budgetScale={props.budgetScale}
      />

      {props.showEnvy && (
        <>
          <div className="border-t border-line" />
          <Field label={t("plan.envy.title")} htmlFor={id("envy")}>
            <textarea
              id={id("envy")}
              className={`${inputClass} min-h-16`}
              value={props.envy}
              maxLength={ENVY_MAX_CHARS}
              placeholder={t("plan.envy.placeholder")}
              disabled={props.disabled}
              onChange={(e) => props.onEnvy(e.target.value)}
            />
          </Field>
        </>
      )}
    </>
  );
}

/**
 * ⟳ 2026-09-25 — LE BUDGET DES COURSES, EN CURSEUR.
 *
 * Demandé: un curseur à la place du champ libre, dont le minimum suit ce qui
 * est donné au-dessus (jours, personnes, absences, régimes) et dont le maximum
 * reste raisonnable. Le bas est le plancher, le haut `budgetCeilingFor` — les
 * deux calculés par l'écran (`budgetScaleFor`).
 *
 * ⚠️ PAS DE MONTANT INVENTÉ: sans réponse, le curseur est posé au minimum mais
 * rien n'est choisi, et la phrase le dit. Le premier geste choisit — y compris
 * un clic sur le curseur sans le déplacer.
 *
 * ⚠️ HORS ÉCHELLE, LE MONTANT GLISSE À LA BORNE LA PLUS PROCHE, comme les
 * champs de cuisine voisins: la réponse choisie est gardée à part
 * (`useOfferedAnswer`) et revient dès que l'échelle la permet de nouveau.
 *
 * Sans échelle (hors France et États-Unis), le champ libre d'avant, borné par
 * `BUDGET_MAX`.
 */
export function BudgetField(props: {
  id: string;
  disabled: boolean;
  /** Ce que le champ porte, tel que tapé. */
  budget: string;
  onBudget: (raw: string) => void;
  budgetVerdict: BudgetVerdict;
  budgetScale: BudgetScale | null;
}) {
  const { budgetScale: scale, onBudget } = props;
  const typed = props.budget.trim();
  // `Number("")` vaut 0 et EST fini: le vide se teste avant.
  const value = typed === "" || !Number.isFinite(Number(typed)) ? null : Number(typed);
  const write = React.useCallback(
    (next: number | null) => onBudget(next === null ? "" : String(next)),
    [onBudget],
  );
  const correct = React.useCallback(
    (intent: number | null) =>
      intent === null || scale === null ? intent : clampToBudgetScale(intent, scale),
    [scale],
  );
  const { shown, pick } = useOfferedAnswer<number>({ value, onChange: write, correct });
  const money = (amount: number) =>
    scale === null ? formatBudgetAmount(amount) : formatPrice(amount, { currency: scale.currency });

  return (
    <Field label={t("plan.cooking.budget_label")} htmlFor={props.id}>
      {scale === null
        ? (
          <input
            id={props.id}
            type="number"
            inputMode="decimal"
            min={1}
            max={BUDGET_MAX}
            step="1"
            className={inputClass}
            value={props.budget}
            disabled={props.disabled}
            onChange={(e) => props.onBudget(e.target.value)}
          />
        )
        : (
          <div className="mt-1">
            <p className="text-lg font-semibold tabular-nums text-ink">
              {shown === null
                ? (
                  <span className="text-sm font-normal text-ink-soft">
                    {t("plan.cooking.budget_pick")}
                  </span>
                )
                : money(shown)}
            </p>
            <input
              id={props.id}
              type="range"
              min={scale.min}
              max={scale.max}
              step={scale.step}
              value={shown ?? scale.min}
              disabled={props.disabled}
              aria-valuetext={shown === null ? t("plan.cooking.budget_pick") : money(shown)}
              onChange={(e) => pick(Number(e.target.value))}
              // Un clic sur le curseur sans le déplacer ne lève pas `change`:
              // c'est quand même un choix, celui du montant affiché.
              onPointerUp={(e) => {
                if (shown === null) pick(Number(e.currentTarget.value));
              }}
              className="mt-2 w-full accent-fig-700 focus:outline-none focus:ring-2 focus:ring-fig-600 disabled:opacity-60"
            />
            <div className="mt-1 flex justify-between text-xs tabular-nums text-ink-soft">
              <span>{money(scale.min)}</span>
              <span>{money(scale.max)}</span>
            </div>
          </div>
        )}
      {/* « Serré » informe et ne retient rien; « sous le plancher » dit le
          montant qui le lève. Les deux se calculent sur ce que le champ
          porte MAINTENANT: un refus qui survit à sa cause est faux. */}
      {props.budgetVerdict.kind === "tight" && (
        <p className="mt-1 text-xs text-ink-soft">
          {t("plan.cooking.budget_tight")}
        </p>
      )}
      {props.budgetVerdict.kind === "below_floor" && (
        <p className="mt-1 text-xs font-medium text-red-700">
          {t("plan.cooking.budget_below_floor").replace(
            "{amount}",
            formatBudgetAmount(props.budgetVerdict.floor),
          )}
        </p>
      )}
    </Field>
  );
}

/**
 * QUI MANGE À LA MAISON — une ligne par personne, son état sur CETTE fenêtre,
 * et deux gestes: « Absence » (hors de tout le plan) et « Modifier » (la
 * grille repas × jours).
 *
 * ⚠️ « Absence » n'apparaît qu'à partir de deux personnes: seul, s'absenter de
 * son propre plan ne laisse rien à composer.
 *
 * ⚠️ LES GRILLES SONT MONTÉES MÊME FERMÉES — `Modal` rend `null` sans démonter
 * l'appelant —, donc une grille modifiée survit à une fermeture accidentelle.
 */
export function PresenceList(props: {
  rows: readonly PresenceRow[];
  days: { tokens: readonly string[]; dates: readonly string[] };
  disabled: boolean;
}) {
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (props.rows.length === 0) return null;

  async function write(row: PresenceRow, next: AwayMark[], close: boolean) {
    setBusy(true);
    setError(null);
    try {
      await row.save(next);
      if (close) setOpenKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const tokens = props.days.tokens;
  const canBeAbsent = props.rows.length > 1;
  const status = props.rows.map((row) => {
    const slots = row.slots.map((s) => s.slot);
    return {
      absent: isAwayAllWindow(row.away, tokens, slots),
      away: awayMomentsIn(row.away, tokens, row.slots.length),
    };
  });
  const everyoneAway = status.every((s) => s.absent);

  return (
    <Field label={t("plan.request.presence_title")}>
      <ul className="divide-y divide-line rounded-card border border-line-strong bg-paper px-4">
        {props.rows.map((row, i) => {
          const { absent, away } = status[i];
          return (
            <li
              key={row.key}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{row.name}</span>
                <span
                  className={`block text-xs ${absent || away > 0 ? "text-fig-700" : "text-ink-soft"}`}
                >
                  {absent
                    ? t("plan.request.presence_absent")
                    : away === 0
                    ? t("plan.request.presence_all_home")
                    : plural(
                      away,
                      t("plan.request.presence_away_one"),
                      t("plan.request.presence_away_other"),
                    ).replace("{n}", String(away))}
                </span>
              </span>
              <span className="flex items-center gap-3">
                {canBeAbsent && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-pressed={absent}
                    aria-label={absent ? undefined : t("plan.request.presence_absence_aria", {
                      name: row.name,
                    })}
                    disabled={busy || props.disabled}
                    onClick={() =>
                      void write(
                        row,
                        absent
                          ? clearWindow(row.away, tokens)
                          : markAwayAllWindow(row.away, tokens),
                        false,
                      )}
                  >
                    {absent
                      ? t("plan.request.presence_absence_undo")
                      : (
                        <span className="inline-flex items-center gap-1">
                          <X aria-hidden className="h-3.5 w-3.5" />
                          {t("plan.request.presence_absence")}
                        </span>
                      )}
                  </Button>
                )}
                {/* UN LIEN, DONC LA MARQUE (charte §2). */}
                <button
                  type="button"
                  disabled={busy || props.disabled}
                  onClick={() => setOpenKey(openKey === row.key ? null : row.key)}
                  className="text-xs font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("plan.request.presence_open")}
                </button>
              </span>
              <MealPickerGrid
                open={openKey === row.key}
                onClose={() => setOpenKey(null)}
                days={tokens}
                dates={props.days.dates}
                rhythm={row.slots}
                away={row.away}
                busy={busy}
                onSave={(next) => write(row, next, true)}
              />
            </li>
          );
        })}
      </ul>
      {everyoneAway && (
        <p className="mt-2 text-xs font-medium text-red-700">
          {t("plan.request.presence_everyone_away")}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </Field>
  );
}
