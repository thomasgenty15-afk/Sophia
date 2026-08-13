import React from "react";
import { useAuth } from "../../context/AuthContext";
import {
  addDays,
  dayTokenOf,
  localDateIn,
  weekDatesFrom,
  weekStartFor,
} from "../api/dates";
import {
  declareDeviation,
  loadPublishedPlanVersion,
  loadSlotVocabulary,
  loadTodaySnapshot,
  logCommitment,
} from "../api/keelClient";
import {
  deviationKindLabel,
  matchVerdictLabel,
  portionBandLabel,
  slotLabel,
} from "../api/labels";
import {
  buildPlanStructure,
  type PlanSection,
  type PlanSubsection,
} from "../api/planStructure";
import {
  ACCEPTED_PHOTO_MIME_TYPES,
  analysisSucceeded,
  MAX_PHOTO_BYTES,
  type MealPhotoUploadResult,
  uploadMealPhoto,
} from "../api/mealPhoto";
import {
  computeLoggingCoverage,
  eventCountsByDate,
  LOGGING_COVERAGE_MIN_DAYS,
  WEEK_DAYS,
} from "../api/progressModel";
import {
  buildTodayView,
  flexRemaining,
  slotReading,
  splitByGrain,
  type TodayFamilyTally,
  type TodayLine,
  todayLines,
  todayLineShape,
  type TodayView,
} from "../api/todayModel";
import {
  type DayToken,
  type DeviationKind,
  NO_SLOT_BUCKET,
  type PlanVersionRow,
  type SlotVocabularyRow,
} from "../api/types";
import {
  currentMonday,
  loadWeekPlan,
  weekPlanDaySplit,
  type WeekPlanItem,
  type WeekPlanRow,
} from "../api/weekPlan";
import {
  dishDaySplit,
  type GeneratedMealResult,
  loadMealPlans,
} from "../api/mealGeneration";
import { mealCopy } from "../api/mealLabels";
import { browserLocalDate, useMealTicks } from "../lib/useMealTicks";
import CommitmentLine, { ActivityChip } from "../components/CommitmentLine";
import DeviationDialog from "../components/DeviationDialog";
import DishCard from "../components/DishCard";
import {
  DayEnergyLine,
  EnergyBasisNote,
  EnergyTargetNote,
} from "../components/plan/EnergyReadout";
import { useMealEnergy } from "../lib/useMealEnergy";
import KeelAppShell from "../components/KeelAppShell";
import KitchenToday from "../components/KitchenToday";
import { Badge } from "../components/ui/Badge";
import { Button, ButtonLink } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { t } from "../i18n/t";

/**
 * The student has an account but no plan to open the day from.
 *
 * IT IS THE STUDENT'S TURN, NOT THE COACH'S. This block used to say the coach
 * was "putting it together" and that the student had nothing to do until then.
 * In the model we actually ship, the coach teaches a METHOD and never writes a
 * per-student week — `/app/plan` is where the student builds their own. Telling
 * someone to wait when the next move is theirs is the worst thing an empty
 * screen can do, so the block now carries the way out.
 *
 * AND THIS PAGE DOES FILL IN NOW. This block used to add "we are not promising
 * this screen fills in", because `/app/today` read `plan_versions` and nothing
 * else. It now reads both of the things `/app/plan` actually writes — the meals
 * (`student_generated_meals`) and, when there is one, the adopted method week
 * (`student_week_plans`) — so the copy is free to point at the way out and mean
 * it. The reason the caveat is gone is that the reader exists, not that the
 * copy got braver.
 *
 * It shows the SPACE rather than a dead end: the shell, the day's real slot
 * headings, and greyed placeholders. The placeholders are bars, never invented
 * commitments — this screen must not suggest a plan that does not exist (the
 * same rule as the landing's mock).
 */
function NoPlanYet() {
  const slots = ["breakfast", "lunch", "dinner"] as const;
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-base font-semibold text-ink">
          {t("today.no_plan_title")}
        </h2>
        <p className="mt-1 max-w-[62ch] text-sm leading-6 text-ink-soft">
          {t("today.no_plan_body")}
        </p>
        <div className="mt-4">
          <ButtonLink to="/app/plan" variant="primary">
            {t("today.no_plan_cta")}
          </ButtonLink>
        </div>
      </Card>

      <section aria-hidden="true">
        <SectionLabel>{t("today.no_plan_preview_label")}</SectionLabel>
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {slots.map((slot) => (
              <li key={slot} className="px-4 py-3">
                <div className="text-label font-semibold uppercase text-ink-soft">
                  {slotLabel(slot)}
                </div>
                {/* Des BARRES, jamais un engagement inventé — même règle que la
                    maquette de la vitrine. `line` est le neutre décoratif de la
                    charte, et c'est exactement son emploi: une pièce posée sur le
                    papier qui n'emprunte aucun sens.
                    `rounded-part` et non `rounded-full`: le cercle complet est
                    réservé aux boutons et aux pastilles d'état, et ce bloc est une
                    figure (`aria-hidden`), donc ses pièces prennent le rayon des
                    pièces. À 10 px de haut, c'est le même dessin. */}
                <div className="mt-2 space-y-2">
                  <span className="block h-2.5 w-2/3 rounded-part bg-line" />
                  <span className="block h-2.5 w-1/2 rounded-part bg-line" />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <p className="mt-2 max-w-[62ch] text-xs leading-5 text-ink-soft">
          {t("today.no_plan_preview_hint")}
        </p>
      </section>

      {/* `text-gray-400` était SOUS le seuil de lisibilité (2,85:1 sur blanc).
          `ink-soft` est à 6,11:1 — la note ne crie pas plus fort, elle se lit. */}
      <p className="max-w-[62ch] text-xs leading-5 text-ink-soft">
        {t("today.no_plan_footer")}
      </p>
    </div>
  );
}

/**
 * LA JOURNÉE QUE L'ÉLÈVE S'EST COMPOSÉE — le rendu de ce que `/app/plan` écrit.
 *
 * ---------------------------------------------------------------------------
 * DEUX SOURCES, PARCE QUE « MY WEEK'S PLAN » EN ÉCRIT DEUX
 * ---------------------------------------------------------------------------
 * Cet écran ne lisait que `plan_versions` — le plan publié par un coach — et,
 * par la règle du modèle, aucun coach n'en publie jamais. Un élève pouvait donc
 * composer toute sa semaine et lire « tu n'as pas encore de plan » tous les
 * jours. Il lit maintenant ce que l'écran d'à côté produit RÉELLEMENT:
 *
 *   `student_generated_meals`  — les PLATS (`MealBuilder`). C'est ce que
 *                                l'élève vient chercher: le dîner de mardi.
 *   `student_week_plans`       — la semaine de MÉTHODE, quand elle existe et
 *                                qu'elle a été adoptée. Des lignes de
 *                                comportement, pas des plats.
 *
 * L'ORDRE EST CELUI DU SOUS-TITRE — « what you eat, then what you do ». Les
 * plats d'abord: c'est la question de la journée.
 *
 * ---------------------------------------------------------------------------
 * CE QU'IL N'Y A PAS ICI, ET C'EST LE POINT
 * ---------------------------------------------------------------------------
 * Pas de case à cocher, pas de « Log it », pas de compteur, pas de série, pas
 * de pourcentage. La semaine de l'élève n'est pas une prescription: personne ne
 * lui a rien prescrit, donc « l'a-t-il suivie » n'a pas d'objet et l'évaluateur
 * KEEL est débranché sur cet axe (PLAN-NUIT, amendement 3).
 *
 * C'est la différence de fond avec le rendu du plan publié plus bas, qui LUI
 * compte — parce que là un coach a signé quelque chose.
 *
 * ---------------------------------------------------------------------------
 * LA DOCTRINE: CITÉE SUR UNE LIGNE DE MÉTHODE, JAMAIS SUR UN PLAT
 * ---------------------------------------------------------------------------
 * Ce n'est pas une incohérence, c'est la même règle appliquée à deux objets.
 * Une LIGNE DE MÉTHODE est une lecture de la conviction du coach: la citer
 * dessous est la seule façon honnête de la présenter (le coach n'a pas écrit
 * cette ligne, un badge « écrit par ton coach » serait un mensonge). Un PLAT
 * n'est pas une lecture de la méthode, c'est un dîner qu'elle a servi à
 * composer — et afficher la méthode dessus transformerait un repas en leçon.
 * `DishCard` n'a donc rien à citer, et `GeneratedDish` ne porte même pas de
 * quoi le faire.
 *
 * LES LIGNES ET LES PLATS SANS JOUR NOMMÉ SONT MIS À PART. Une ligne qui vaut
 * pour la semaine entière, lue dans la liste du jour, fait croire qu'on est en
 * retard tous les jours. Le plan publié applique déjà cette séparation
 * (`splitByGrain`); celle-ci est la même règle sur les deux autres sources.
 */
function OwnDay({
  plan,
  meals,
  day,
}: {
  plan: WeekPlanRow | null;
  meals: GeneratedMealResult | null;
  day: DayToken;
}) {
  const { user } = useAuth();
  const dishes = meals ? dishDaySplit(meals.dishes, day) : null;
  const lines = plan ? weekPlanDaySplit(plan.items, day) : null;
  // LES COCHES, SUR L'ÉCRAN OÙ ON MANGE. Même liaison que `/app/plan` — le plat
  // est le même objet, la case doit être la même case.
  //
  // TOUT CE QUE CET ÉCRAN REND EST DATÉ D'AUJOURD'HUI, et ce n'est pas un
  // raccourci: il ne montre que les plats du jour (`dishes.today`) ou ceux qui
  // ne nomment aucun jour (`dishes.anyDay`), qu'on rapporte le jour où on les
  // mange. Le rattrapage des jours écoulés vit sur `/app/plan`, qui est le seul
  // écran à montrer la semaine entière.
  const todayDate = browserLocalDate();
  const ticks = useMealTicks({
    userId: user?.id ?? "",
    mealId: meals?.mealId ?? null,
    dishes: meals?.dishes ?? [],
  });
  // FF-059 — LE MÊME CHIFFRE QUE SUR `/app/plan`, par la même liaison. Deux
  // lectures du même plat produiraient deux nombres, et rien à l'écran ne
  // dirait lequel ment.
  const energy = useMealEnergy({
    planId: meals?.mealId ?? null,
    dishes: meals?.dishes ?? [],
  });
  // SURFACE B SUR TODAY — la somme de CE jour, prise dans la table du plan.
  // Elle n'est pas recalculée ici: elle est LA MÊME entrée que celle du titre
  // de jour sur l'écran du plan.
  const dayEnergy = energy.showing ? energy.forDay(day) : null;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{t("today.own_week_badge")}</Badge>
        </div>
        <p className="mt-2 max-w-[62ch] text-sm leading-6 text-ink-soft">
          {t("today.own_week_hint")}
        </p>
        <div className="mt-4">
          <ButtonLink to="/app/plan" size="sm">
            {t("today.own_week_open_plan")}
          </ButtonLink>
        </div>
      </Card>

      {/* CE QUE LA JOURNÉE DEMANDE — avant les plats, et c'est l'ordre qui
          compte: une session de cuisine ou une course se décident AVANT de
          lire ce qu'on mange, et un jour de cuisson découvert après le dîner
          ne sert plus à rien. Rendu `null` quand il n'y a ni session ni
          liste. */}
      <KitchenToday meals={meals} todayDate={todayDate} />

      {/* CE QUE JE MANGE. Le plat entier, ingrédients et méthode compris: on
          cuisine sur cet écran-là, pas sur l'autre. */}
      {dishes && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SectionLabel>{t("today.own_meals_label")}</SectionLabel>
            {/* FF-059 · SURFACE B — la somme du jour, à côté du titre de la
                section qui la produit. Absente quand une porte est fermée: il
                n'y a alors aucun chiffre dans cet écran. */}
            <DayEnergyLine energy={dayEnergy} />
          </div>
          {/* ⛔ UN FAIT. Rouge = échec; `red-700` est la valeur du produit
              (6,13:1), `red-600` était à 4,83:1. */}
          {ticks.error && (
            <p className="mb-3 text-sm text-red-700">
              {mealCopy("meals.tick.failed")}
            </p>
          )}
          {dishes.today.length > 0
            ? (
              <div className="space-y-3">
                {dishes.today.map((dish, i) => (
                  <DishCard
                    key={`d${i}-${dish.title}`}
                    dish={dish}
                    tick={ticks.bind(dish, todayDate)}
                    energy={energy.showing ? energy.forDish(dish) : null}
                  />
                ))}
              </div>
            )
            : (
              <Card tone="dashed">
                <p className="max-w-[62ch] text-sm leading-6 text-ink-soft">
                  {dishes.anyDay.length > 0
                    ? t("today.own_meals_empty")
                    : t("today.own_meals_other_days")}
                </p>
              </Card>
            )}

          {dishes.anyDay.length > 0 && (
            <div className="mt-5">
              <SectionLabel>{t("today.own_meals_anyday")}</SectionLabel>
              <div className="space-y-3">
                {dishes.anyDay.map((dish, i) => (
                  <DishCard
                    key={`a${i}-${dish.title}`}
                    dish={dish}
                    tick={ticks.bind(dish, todayDate)}
                    energy={energy.showing ? energy.forDish(dish) : null}
                  />
                ))}
              </div>
            </div>
          )}
          {/* D'OÙ VIENT LE CHIFFRE. Une fois par écran, et seulement s'il y en
              a un: sans elle, rien ne distingue ce CALCUL d'une estimation par
              photo — que le produit refuse précisément d'afficher. */}
          {energy.showing && (
            <div className="mt-4 space-y-2">
              <EnergyTargetNote target={energy.target} />
              <EnergyBasisNote />
            </div>
          )}
        </section>
      )}

      {/* CE QUE JE ME SUIS FIXÉ. La semaine de méthode, quand elle existe: elle
          n'est plus produite par `/app/plan`, mais une semaine déjà adoptée ne
          doit pas disparaître de l'écran parce qu'on a changé de moteur. */}
      {lines && (
        <section>
          <SectionLabel>{t("today.own_lines_label")}</SectionLabel>
          {lines.today.length > 0
            ? (
              <Card padded={false}>
                <ul className="divide-y divide-line">
                  {lines.today.map((item, i) => <OwnWeekLine key={`l${i}`} item={item} />)}
                </ul>
              </Card>
            )
            : (
              <Card tone="dashed">
                <p className="max-w-[62ch] text-sm leading-6 text-ink-soft">
                  {lines.anyDay.length > 0
                    ? t("today.own_week_empty")
                    : t("today.own_week_nothing")}
                </p>
              </Card>
            )}

          {lines.anyDay.length > 0 && (
            <div className="mt-5">
              <SectionLabel>{t("today.own_week_anyday")}</SectionLabel>
              <Card padded={false}>
                <ul className="divide-y divide-line">
                  {lines.anyDay.map((item, i) => <OwnWeekLine key={`n${i}`} item={item} />)}
                </ul>
              </Card>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Une ligne: ce qu'elle demande, pourquoi, et d'où elle vient. */
function OwnWeekLine({ item }: { item: WeekPlanItem }) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">{item.label}</span>
        <Badge tone={item.kind === "nutrition" ? "info" : "neutral"}>
          {item.kind === "nutrition"
            ? t("today.own_week_from_coach")
            : t("today.own_week_from_sophia")}
        </Badge>
      </div>
      {item.rationale ? (
        <p className="mt-1 max-w-[62ch] text-xs leading-5 text-ink-soft">
          {item.rationale}
        </p>
      ) : null}
      {/* La conviction du coach, CITÉE. Le code garantit que la ligne en nomme
          une réelle (CHECK en base); il ne peut pas garantir que
          l'interprétation soit fidèle. La montrer est la seule façon honnête de
          présenter une lecture générée de la méthode de quelqu'un d'autre —
          l'élève peut juger, et le coach par-dessus son épaule aussi. */}
      {item.source_belief_claim ? (
        <blockquote className="mt-2 max-w-[62ch] border-l-2 border-line-strong pl-3 text-xs italic leading-5 text-ink-soft">
          {item.source_belief_claim}
        </blockquote>
      ) : null}
    </li>
  );
}

// KEEL — /app/today. The student's day, grouped by slot.
//
// THE THREE INVARIANTS THIS SCREEN IMPLEMENTS
//
// 1. THE PAGE IS THE PLAN, AND IT IS THE SAME PLAN THE COACH SIGNED. Sections
//    and headings come from `api/planStructure.ts` — the one module the import
//    review, the template editor and this page all call. Not "the same rule
//    implemented twice": the same function, so there is nothing to keep in sync.
//
//    "What I eat" then "What I do", then what is only watched. Inside food, the
//    coach's own four headings: every day, every week, what we are cutting,
//    supplements. Inside actions, the family. Word for word what the coach read
//    at import, so a client asking "where is my magnesium" gets the same answer
//    from either screen.
//
//    THE ONE THING THAT IS NOT SHARED IS THE ORDER *INSIDE* A HEADING, and that
//    is deliberate. A coach reviewing a prescription reads it as they wrote it;
//    a student eats in the order of their day. So under "Every day" the meals
//    come back, in vocabulary order, waking to bedtime (`slotReading`) — same
//    skeleton, internal order adapted to the reader. A slot absent from the
//    vocabulary still throws rather than landing in an "other" pile.
//
//    WEEK-GRAIN LINES STAY OUT OF TODAY'S LIST. Inside any heading, what is
//    judged on the week is set apart under "this week" (`splitByGrain`) — a
//    student who reads "3 sessions a week" as today's list believes they are
//    behind every single day. Under the "Every week" heading the caption is
//    dropped: the heading has already said it.
//
//    Nothing is dropped and nothing is shown twice: `buildPlanStructure`
//    partitions the lines exactly, and `keelModels.int.test.ts` pins the count.
//
//    Each family carries an icon and a tint (`ActivityChip`), the same one on
//    the line, on the section header and in the day tally, so "nutrition held,
//    movement did not" is readable without reading a single word.
//
// 2. THE DISPLAY GATE IS ABSOLUTE. Below 4 logged days out of 7 this page shows
//    `insufficient_data` and NO percentage. Not a greyed-out number, not a
//    tooltip with the real value: the number does not exist on the page. This
//    is a product invariant (CONTRACT, "Two numbers, never merged"), not a
//    styling preference — the whole point is that a student cannot be scored on
//    a week they barely reported.
//
// 3. DEVIATION IS FIRST CLASS. The button sits at the top of the page next to
//    the plan, because in nutrition eating off-plan is the nominal case. A
//    deviation declared in advance removes the slot from the denominator; the
//    same evening undeclared scores zero. Making that affordance easy to find
//    is the single highest-leverage thing this screen does.
//
// 4. (W5.4) A PHOTO IS EVIDENCE, NOT A MEASUREMENT. The camera button sits on
//    the SLOT, not on a commitment line: a plate is one photo that may speak to
//    several lines, and asking the student to pick one first would force a
//    binding the image may not support. What comes back is what the plate shows
//    (foods, portion BAND, per-line consistency) and never a quantity: no
//    calorie, no gram, no percentage — including no confidence percentage.
//    `recognition_confidence` is not even fetched by `keelClient`, so the number
//    this screen must not show never reaches it.

/**
 * Pick a photo for one slot, look at it, send it. Three steps, no auto-send:
 * the student sees exactly what leaves the device.
 *
 * ── LE BLEU CIEL EST PARTI, ET C'ÉTAIT LE CAS LE PLUS INSIDIEUX ─────────────
 * Ce composeur était une surface `sky-50` bordée `sky-200`, avec cinq libellés
 * `sky-800/900` et un bouton `sky-600`. Aucun état n'était en cause: c'était du
 * bleu « informatif », c'est-à-dire une décoration. Or **le bleu est pris**:
 * `info` occupe le bleu dans `ui/Badge.tsx` — quatre familles d'état, pas trois.
 * Une surface bleue décorative à côté d'une pastille `info` bleue rend la
 * pastille MUETTE, et c'est la pastille qui portait un fait.
 *
 * Ce qui porte l'ouverture du composeur maintenant: un remplissage `paper-2`
 * fermé par un trait de contrôle `line-strong`. La même forme que le fronton
 * d'une fenêtre — un panneau qui s'ouvre, pas une couleur qui parle.
 */
function PhotoComposer(props: {
  pending: PendingPhoto;
  busy: boolean;
  error: string | null;
  onPick: (file: File | null) => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  const { pending, busy, error } = props;
  return (
    <div className="mt-2 rounded-card border border-line-strong bg-paper-2 p-3">
      <label className="block cursor-pointer text-xs font-medium text-ink">
        {pending.file ? t("photo.change") : t("photo.choose")}
        {/* Le bouton du sélecteur de fichier est un BOUTON: `rounded-full` et un
            contour de contrôle `line-strong`, comme tous les autres du produit. */}
        <input
          type="file"
          accept={ACCEPTED_PHOTO_MIME_TYPES.join(",")}
          capture="environment"
          disabled={busy}
          className="mt-1 block w-full min-w-0 text-xs text-ink-soft file:mr-2 file:rounded-full file:border file:border-line-strong file:bg-paper file:px-2 file:py-1 file:text-xs file:font-medium file:text-ink"
          onChange={(e) => props.onPick(e.target.files?.[0] ?? null)}
        />
      </label>

      {pending.previewUrl && (
        <img
          src={pending.previewUrl}
          alt={t("photo.preview_alt")}
          className="mt-2 max-h-48 w-auto rounded-card border border-line object-cover"
        />
      )}

      {/* ⛔ UN FAIT, ET IL RESTE — seule la famille change: le produit dit
          l'échec en `red` (`ui/Badge.tsx`, `ui/Field.tsx`), et `rose-*` était un
          SECOND rouge pour le même sens. */}
      {error && (
        <p className="mt-2 rounded-card bg-red-50 p-2 text-xs leading-5 text-red-700">
          {error}
        </p>
      )}

      {/* ⚠️ « Envoyer » est en `secondary`, PAS en `primary`, et c'est mesuré au
          rendu: rien n'empêche ce composeur d'être ouvert en même temps que le
          panneau de déviation, qui porte l'unique action figue de l'écran. Deux
          aplats de marque côte à côte, c'est zéro hiérarchie. Le contour de
          contrôle contre le `ghost` d'« Annuler » dit déjà lequel des deux gestes
          est le geste. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy || !pending.file}
          onClick={props.onSend}
        >
          {busy ? t("photo.sending") : t("photo.send")}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={props.onCancel}>
          {t("photo.cancel")}
        </Button>
      </div>
      <p className="mt-2 max-w-[62ch] text-[11px] leading-4 text-ink-soft">
        {t("photo.no_quantity_note")}
      </p>
    </div>
  );
}

/**
 * What the photo showed.
 *
 * THREE THINGS THIS PANEL IS NOT ALLOWED TO DO, each one a contract rule rather
 * than a taste:
 *  - show a calorie or gram figure (non-input #4): the payload has no field
 *    carrying one, and the server strips any the model emitted;
 *  - show a percentage of any kind, confidence included: the payload carries
 *    `confidence_band`, a token, and the numeric confidence is not fetched;
 *  - show an evaluator status. The badge on each line is the DERIVED grade,
 *    written server-side. This panel reports EVIDENCE, in its own words
 *    ("Looks consistent"), so the two can never be read as one.
 */
function PhotoOutcomePanel(props: {
  result: MealPhotoUploadResult;
  titleOf: (commitmentId: string) => string | null;
}) {
  const { result } = props;
  const recognized = result.analysis?.recognized ?? null;
  const analyzed = analysisSucceeded(result) && recognized !== null;

  // ⛔ L'ÉMERAUDE RESTE, ET C'EST LA RÈGLE. « La photo est enregistrée » est un
  // ENREGISTREMENT CONFIRMÉ, c'est-à-dire un fait — et un état a le droit d'être
  // une surface, pas seulement une pastille (`Card tone="warning"` le prouve dans
  // le kit). Émeraude = ok dans tout le produit; l'appauvrir en gris retirerait
  // la seule couleur de cet écran qui dit quelque chose de vrai. Seul le RAYON
  // change: `rounded-lg` n'existe plus dans le vocabulaire, `card` (12px) oui.
  return (
    <div className="mt-2 rounded-card border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
      <p className="font-medium">{t("photo.saved")}</p>
      {result.idempotent && (
        <p className="mt-1 text-emerald-800">{t("photo.already_on_file")}</p>
      )}

      {/* The photo is committed either way. When the reading did not happen we
          say so, instead of showing an empty panel that implies "nothing on the
          plate". */}
      {!analyzed && <p className="mt-1">{t("photo.analysis_failed")}</p>}

      {analyzed && recognized!.image_quality === "unusable" && (
        <p className="mt-1">{t("photo.unusable")}</p>
      )}

      {analyzed && recognized!.image_quality !== "unusable" && (
        <div className="mt-2 space-y-2">
          {(recognized!.detected_foods ?? []).length > 0 && (
            <p>
              <span className="text-emerald-700">{t("photo.detected_label")}: </span>
              {(recognized!.detected_foods ?? []).map((f) => f.label).join(", ")}
            </p>
          )}

          {recognized!.portion_band && (
            <p>
              <span className="text-emerald-700">{t("photo.portion_label")}: </span>
              {portionBandLabel(recognized!.portion_band)}
            </p>
          )}

          {(recognized!.commitment_matches ?? []).length > 0 && (
            <div>
              <p className="text-emerald-700">{t("photo.verdict_label")}</p>
              <ul className="mt-1 space-y-1">
                {(recognized!.commitment_matches ?? []).map((m) => (
                  <li key={m.commitment_id}>
                    <span className="font-medium">{matchVerdictLabel(m.verdict)}</span>
                    {props.titleOf(m.commitment_id) && (
                      <span> - {props.titleOf(m.commitment_id)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recognized!.confidence_band === "low" && (
            <p className="text-emerald-800">{t("photo.low_confidence")}</p>
          )}
          <p className="text-[11px] leading-4 text-emerald-700">
            {t("photo.no_quantity_note")}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The day at a glance, one chip per family: "Nutrition 3/4 - Movement 0/1".
 *
 * THE RATIO IS GATED, and it is worth being precise about why, because the
 * counts are only today's and the gate is about the week.
 *
 * `kept/evaluable` is an AGGREGATE OF GRADES. The per-line badges below it are
 * already visible ungated, and that is on purpose — a single badge answers "how
 * did this one go". A summed ratio answers "how am I doing", which is the exact
 * question this app refuses to answer on a week it barely observed. So below
 * 4/7 logged days the chips still appear — the families are useful navigation —
 * but they carry the number of lines only, never a numerator. And no percentage
 * appears in either mode: `3/4` is two counts a reader can verify against the
 * badges, `75 %` is a score.
 *
 * A family with nothing evaluable today (everything covered by a declared
 * deviation, everything tracked-not-scored) shows its line count too: reporting
 * `0/0` would read as a failure where the plan granted latitude.
 */
function FamilyTallyStrip(
  { tallies, gateOpen }: { tallies: readonly TodayFamilyTally[]; gateOpen: boolean },
) {
  if (tallies.length === 0) return null;
  return (
    <div className="mb-4">
      <span className="mb-1.5 block text-label font-semibold uppercase text-ink-soft">
        {t("today.family_tally_label")}
      </span>
      {/* Le cadre de la pastille reste le plus discret possible: `ActivityChip`
          porte déjà sa propre teinte de famille, et l'entourer d'un second trait
          fort ferait deux cadres pour une seule chose. `paper-2` (1,08:1) donne
          la pièce, le trait `line` donne l'arête. */}
      <div className="flex flex-wrap items-center gap-2">
        {tallies.map((tally) => (
          <span
            key={tally.activityClass}
            className="inline-flex items-center gap-1.5 rounded-card border border-line bg-paper-2 px-2 py-1"
          >
            <ActivityChip activityClass={tally.activityClass} />
            {/* ⛔ UN CHIFFRE NE PORTE JAMAIS LA MARQUE (charte §2): `ink`. */}
            <span className="text-xs tabular-nums text-ink">
              {gateOpen && tally.evaluable > 0
                ? t("today.family_tally_kept", {
                  kept: tally.kept,
                  total: tally.evaluable,
                })
                : t("today.family_tally_lines", { count: tally.total })}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * ONE PART OF THE DAY — "What I eat", "What I do".
 *
 * The label, the sentence under it and the count all arrive resolved on
 * `section`: this component chooses a FRAME and nothing else. That is the
 * point — the day used to decide its own headings, which is how the student's
 * page and the coach's two screens ended up describing the same plan three
 * different ways.
 *
 * The observations render `quiet`: they are tracked, not scored, and they must
 * not read as a third list of things to hold.
 *
 * ── TROIS TEINTES SONT DEVENUES UNE, ET LA SURVIVANTE PORTE UN FAIT ─────────
 * Ce composant peignait `food` en lime, `actions` en orange et `unsorted` en
 * ambre — `orange` et `amber` sont d'ailleurs à 30° l'un de l'autre, donc
 * l'échelle ne se lisait même pas. « Ce que je mange » et « ce que je fais » sont
 * des CATÉGORIES, et une catégorie n'est aucun état du système: elles perdent
 * leur teinte.
 *
 * ⛔ `unsorted` GARDE SON AMBRE, et il faut lire `api/planStructure.ts` pour voir
 * pourquoi ce n'est pas une exception de complaisance: « a line whose family we
 * could not place is a thing the coach must FIX ». C'est un AVERTISSEMENT sur la
 * prescription, pas un rang — donc un fait, donc ambre, et aux valeurs exactes de
 * `Card tone="warning"` (`amber-200` / `amber-50`) plutôt qu'à un demi-fond
 * inventé ici. Devenue la SEULE partie teintée, elle se voit enfin.
 *
 * Ce qui distingue les parties maintenant est une forme: l'équerre `.eq` collée
 * au titre (elle « marque l'origine de ce qui est spécifié », charte §4), la
 * taille du titre, et le pointillé des observations — qui dit « en attente, pas
 * noté » comme `Card tone="dashed"` le dit partout ailleurs.
 */
function DayPart({
  section,
  children,
}: {
  section: PlanSection<TodayLine>;
  children: React.ReactNode;
}) {
  const { part, label, hint, count } = section;
  // A day with no action in it shows no "What I do" heading: an empty heading
  // reads as something missing, and nothing is missing. `buildPlanStructure`
  // already drops the empty parts; this is the belt on the same rule.
  if (count === 0) return null;

  if (part === "observations") {
    return (
      <section className="rounded-card border border-dashed border-line-strong bg-paper-2 p-3">
        {/* ⚠️ PAS de `px-*` sur le nœud qui porte `.eq`: la classe pose
            `padding-left: 1.125rem` hors de toute couche CSS et bat un utilitaire
            de même spécificité. Le `p-3` est sur la section. */}
        <h2 className="eq flex items-baseline gap-2 text-label font-semibold uppercase text-ink-soft">
          {label}
          <span className="text-[11px] font-normal normal-case tracking-normal tabular-nums text-ink-soft">
            {count}
          </span>
        </h2>
        <p className="mb-2 mt-1 max-w-[62ch] text-[11px] leading-4 text-ink-soft">{hint}</p>
        <div className="space-y-2">{children}</div>
      </section>
    );
  }

  // La seule teinte qui survit, et elle porte un fait: une ligne dont la famille
  // n'a pas pu être typée est un défaut de prescription que le coach doit
  // réparer. Valeurs de `Card tone="warning"`.
  const frame = part === "unsorted"
    ? "border-amber-200 bg-amber-50"
    : "border-line-strong bg-paper";

  return (
    <section className={`rounded-card border ${frame} p-3`}>
      <h2 className="eq flex items-baseline gap-2 text-base font-semibold text-ink">
        {label}
        <span className="text-xs font-normal tabular-nums text-ink-soft">{count}</span>
      </h2>
      <p className="mb-3 mt-0.5 max-w-[62ch] text-xs leading-5 text-ink-soft">{hint}</p>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/**
 * A SUB-GROUP INSIDE A PART — "Every day", "What we are cutting", or the family
 * chip for an action.
 *
 * Same heading, same chip, same count as `PartSubgroup` on the import review:
 * the coach ticks "Supplements — 4" and the student opens their day and finds
 * "Supplements — 4". The count is what makes that checkable rather than
 * decorative.
 */
function DaySubsection({
  subsection,
  children,
}: {
  subsection: PlanSubsection<TodayLine>;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        {subsection.kind === "activity_class"
          ? <ActivityChip activityClass={subsection.key} size="md" />
          : (
            <h3 className="text-label font-semibold uppercase text-ink-soft">
              {subsection.label}
            </h3>
          )}
        <span className="text-[11px] tabular-nums text-ink-soft">
          {subsection.lines.length}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "no_plan" }
  // LA SEMAINE QUE L'ÉLÈVE S'EST COMPOSÉE. Un état à part entière, et pas une
  // variante de `ready`: rien de la machinerie du plan publié ne s'applique ici
  // — pas de créneau, pas d'engagement à cocher, pas de dénominateur. Les
  // mélanger aurait fait passer des lignes sans créneau dans un rendu qui en
  // exige un, et surtout aurait rendu tentant de leur coller un score.
  //
  // `plan` et `meals` sont tous deux nullables, mais PAS ENSEMBLE: l'état n'est
  // construit que si l'un des deux existe (sinon c'est `no_plan`).
  | {
    kind: "own_week";
    plan: WeekPlanRow | null;
    meals: GeneratedMealResult | null;
    day: DayToken;
  }
  | { kind: "ready"; data: ReadyData };

interface ReadyData {
  planVersion: PlanVersionRow;
  slotVocabulary: SlotVocabularyRow[];
  view: TodayView;
  today: string;
  weekDates: string[];
  loggedDays: number;
  flexLeft: number;
}

/**
 * The photo being composed for one slot.
 *
 * `uploadId` is minted ONCE per selected file and kept across retries: it keys
 * both the object path and `source_message_id` server-side, so a second attempt
 * at the same photo collides with the row already on file instead of writing a
 * duplicate fact. Regenerating it on retry would defeat exactly that.
 */
interface PendingPhoto {
  slotKey: string;
  file: File | null;
  previewUrl: string | null;
  uploadId: string;
}

/** What came back, kept next to the slot it belongs to. */
interface PhotoOutcome {
  slotKey: string;
  result: MealPhotoUploadResult;
}

export default function TodayPage() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [pendingLine, setPendingLine] = React.useState<string | null>(null);
  const [logError, setLogError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deviationSubmitting, setDeviationSubmitting] = React.useState(false);
  const [deviationError, setDeviationError] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = React.useState<PendingPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [photoOutcome, setPhotoOutcome] = React.useState<PhotoOutcome | null>(null);

  const load = React.useCallback(async () => {
    if (!userId) return;
    setState({ kind: "loading" });
    try {
      const [slotVocabulary, planVersion] = await Promise.all([
        loadSlotVocabulary(),
        loadPublishedPlanVersion(userId),
      ]);
      if (!planVersion) {
        // PAS DE PLAN PUBLIÉ — CE QUI EST LE CAS NOMINAL, PAS L'EXCEPTION.
        // Dans le modèle qu'on livre, le coach enseigne une méthode et ne
        // publie aucun `plan_versions` (docs/keel/MODEL.md). Ce chemin est donc
        // le SEUL emprunté en pratique, et il rendait un écran vide à un élève
        // qui venait de composer toute sa semaine dans `/app/plan`.
        //
        // ON LIT LES DEUX CHOSES QUE `/app/plan` ÉCRIT, et dans cet ordre-là:
        //  - LES PLATS (`student_generated_meals`), qui sont ce que cet écran
        //    produit aujourd'hui — `MealBuilder` est tout ce qu'il monte;
        //  - LA SEMAINE DE MÉTHODE (`student_week_plans`), quand une ancienne
        //    existe. On ne retient que `adopted`: générer n'est pas adopter, et
        //    un brouillon rendu ici comme la journée de quelqu'un serait le
        //    plan de la machine porté par l'élève.
        //
        // Les deux lectures partent ensemble: elles ne dépendent pas l'une de
        // l'autre, et les enchaîner ne ferait qu'ajouter un aller-retour.
        const weekStart = currentMonday();
        const [ownWeek, ownMeals] = await Promise.all([
          loadWeekPlan(weekStart),
          // ── LE PLAN COURANT, PAS LE DERNIER ÉCRIT ──────────────────────
          // C'était « la dernière composition de la semaine en cours », faute
          // de fenêtre en base. Depuis qu'un élève peut PRÉPARER la semaine
          // suivante, ce chargeur-là aurait servi le dîner de la semaine
          // prochaine comme plat du soir. `loadMealPlans` rend le plan dont la
          // fenêtre CONTIENT aujourd'hui, et rien d'autre.
          loadMealPlans(userId, browserLocalDate()),
        ]);
        const adopted = ownWeek && ownWeek.status === "adopted" ? ownWeek : null;
        const currentMeals = ownMeals.current;
        const composed = currentMeals && currentMeals.dishes.length > 0
          ? currentMeals
          : null;
        if (adopted || composed) {
          setState({
            kind: "own_week",
            plan: adopted,
            meals: composed,
            // Le jour dans l'horloge du navigateur, la même que celle qui a
            // écrit `week_start`: sans plan publié il n'y a aucun fuseau à
            // lire, et en inventer un ferait lire mardi un lundi soir.
            day: dayTokenOf(localDateIn(
              Intl.DateTimeFormat().resolvedOptions().timeZone,
            )),
          });
          return;
        }
        setState({ kind: "no_plan" });
        return;
      }
      // The day is resolved in the PLAN's timezone, never the browser's: a
      // student travelling must not see tomorrow's slots at 23:00 local.
      const today = localDateIn(planVersion.timezone);
      const weekStart = weekStartFor(
        today,
        (planVersion.week_starts_on || "mon") as DayToken,
      );
      const weekDates = weekDatesFrom(weekStart);
      const snapshot = await loadTodaySnapshot({
        userId,
        planVersionId: planVersion.id,
        weekDates,
      });
      const view = buildTodayView({
        localDate: today,
        commitments: snapshot.commitments,
        evaluations: snapshot.evaluations,
        events: snapshot.events,
        deviations: snapshot.deviations,
        slotVocabulary,
      });
      const coverage = computeLoggingCoverage(
        weekDates,
        eventCountsByDate(snapshot.events),
      );
      setState({
        kind: "ready",
        data: {
          planVersion,
          slotVocabulary,
          view,
          today,
          weekDates,
          loggedDays: coverage.loggedDays,
          flexLeft: flexRemaining({
            allowance: planVersion.flex_allowance_per_week,
            deviationsThisWeek: snapshot.deviations,
          }),
        },
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [userId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onLog = async (line: TodayLine) => {
    if (!userId || state.kind !== "ready") return;
    setLogError(null);
    setPendingLine(line.commitment.id);
    try {
      await logCommitment({
        userId,
        commitment: line.commitment,
        localDate: state.data.today,
        // The ordinal of THIS occasion: the count already on file plus one.
        occurrence: line.loggedEvents.length + 1,
      });
      // Re-read the whole day rather than patching local state: the only thing
      // this screen is allowed to show is what the database returns.
      await load();
    } catch (err) {
      setLogError(err instanceof Error ? err.message : t("today.log_error"));
    } finally {
      setPendingLine(null);
    }
  };

  // Object URLs are a real leak if the component unmounts mid-compose.
  React.useEffect(() => {
    return () => {
      if (pendingPhoto?.previewUrl) URL.revokeObjectURL(pendingPhoto.previewUrl);
    };
  }, [pendingPhoto?.previewUrl]);

  const closePhoto = React.useCallback(() => {
    setPendingPhoto((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setPhotoError(null);
  }, []);

  const onOpenPhoto = (slotKey: string) => {
    closePhoto();
    setPhotoOutcome(null);
    setPendingPhoto({
      slotKey,
      file: null,
      previewUrl: null,
      uploadId: crypto.randomUUID(),
    });
  };

  const onPickPhoto = (file: File | null) => {
    if (!file) return;
    // Refuse here, with the reason, rather than letting the server refuse after
    // the whole payload has travelled.
    if (!(ACCEPTED_PHOTO_MIME_TYPES as readonly string[]).includes(file.type.toLowerCase())) {
      setPhotoError(t("photo.unsupported_type"));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(t("photo.too_large"));
      return;
    }
    setPhotoError(null);
    setPendingPhoto((current) => {
      if (!current) return current;
      if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return { ...current, file, previewUrl: URL.createObjectURL(file) };
    });
  };

  const onSendPhoto = async () => {
    if (!pendingPhoto?.file || state.kind !== "ready") return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const result = await uploadMealPhoto({
        file: pendingPhoto.file,
        // The slot the student photographed. A slot is never guessed from the
        // wall clock: "19:00 means dinner" is an inference the schema refuses.
        slotKey: pendingPhoto.slotKey,
        clientUploadId: pendingPhoto.uploadId,
      });
      setPhotoOutcome({ slotKey: pendingPhoto.slotKey, result });
      closePhoto();
      // Re-read the whole day: the fact now exists server-side, and this screen
      // only ever shows what the database returns.
      await load();
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : t("photo.error"));
    } finally {
      setPhotoBusy(false);
    }
  };

  const onDeclare = async (args: {
    localDate: string;
    slotKey: string | null;
    kind: DeviationKind;
    note: string | null;
  }) => {
    if (!userId || state.kind !== "ready") return;
    setDeviationError(null);
    setDeviationSubmitting(true);
    try {
      const row = await declareDeviation({
        userId,
        planVersionId: state.data.planVersion.id,
        localDate: args.localDate,
        slotKey: args.slotKey,
        kind: args.kind,
        note: args.note,
        // R2: the note is prose, so the row states its language. The pilot
        // writes English (locale.ts is the single point of change).
        contentLocale: "en-US",
      });
      // Grounded acknowledgement: built from the row we just read back.
      setFlash(
        t("deviation.declared", {
          kind: deviationKindLabel(row.kind),
          date: row.local_date,
        }),
      );
      setDialogOpen(false);
      await load();
    } catch (err) {
      setDeviationError(err instanceof Error ? err.message : t("deviation.error"));
    } finally {
      setDeviationSubmitting(false);
    }
  };

  if (state.kind === "loading") {
    return (
      <KeelAppShell title={t("today.title")}>
        <p className="text-sm text-ink-soft">{t("today.loading")}</p>
      </KeelAppShell>
    );
  }

  if (state.kind === "error") {
    return (
      <KeelAppShell title={t("today.title")}>
        {/* ⛔ UN FAIT: rouge = échec. `rose-*` était une seconde famille rouge
            pour le même sens; le produit dit l'échec en `red-50`/`red-700`. */}
        <p className="rounded-card bg-red-50 p-3 text-sm text-red-700">
          {t("today.error")}
        </p>
        <p className="mt-2 break-words font-mono text-xs text-ink-soft">
          {state.message}
        </p>
      </KeelAppShell>
    );
  }

  if (state.kind === "own_week") {
    return (
      <KeelAppShell title={t("today.title")} subtitle={t("today.subtitle")}>
        <OwnDay plan={state.plan} meals={state.meals} day={state.day} />
      </KeelAppShell>
    );
  }

  if (state.kind === "no_plan") {
    return (
      <KeelAppShell title={t("today.title")} subtitle={t("today.subtitle")}>
        <NoPlanYet />
      </KeelAppShell>
    );
  }

  const { data } = state;
  const gateOpen = data.loggedDays >= LOGGING_COVERAGE_MIN_DAYS;
  // THE PLAN, IN THE COACH'S OWN SECTIONS. `todayLines` hands over every line
  // of the day exactly once; `buildPlanStructure` files them under the same
  // headings the import review and the template editor use. Nothing here
  // filters anything out — the module throws rather than let a line fall out of
  // its part.
  //
  // `order: "occasion"` is THE ONE THING THIS SCREEN ASKS FOR that the coach's
  // two screens do not: inside every heading, read the lines forward through
  // the day. Handing over the vocabulary is how the page says "I have a day
  // around me" — a template being composed has none, which is exactly why the
  // two readings differ in this and in nothing else.
  const structure = buildPlanStructure(
    todayLines(data.view),
    todayLineShape,
    { voice: "student", order: "occasion", slotOrder: data.slotVocabulary },
  );

  const lineOf = (line: TodayLine) => (
    <CommitmentLine
      key={line.commitment.id}
      line={line}
      pending={pendingLine === line.commitment.id}
      onLog={onLog}
    />
  );

  /**
   * The week-grain lines of a sub-group, set apart INSIDE it.
   *
   * "Oily fish 3 times a week" belongs under what I eat, but it is not due
   * today, and a student who reads it as today's list will believe they are
   * behind every single day.
   *
   * `caption` is dropped under EXACTLY ONE heading — "Every week" — which has
   * already said it. It is NOT dropped merely because a sub-group happens to
   * hold no day line: "Zone 2, 3 sessions a week" is the only movement in this
   * plan, and under a bare "Movement" heading with nothing to contrast it
   * against, silence is what makes a student read a weekly target as today's.
   */
  const weekBlock = (lines: readonly TodayLine[], caption: boolean) =>
    lines.length === 0 ? null : (
      <div>
        {caption && (
          <>
            <h4 className="mb-1 text-label font-semibold uppercase text-ink-soft">
              {t("today.week_section")}
            </h4>
            <p className="mb-2 max-w-[62ch] text-[11px] leading-4 text-ink-soft">
              {t("today.week_section_hint")}
            </p>
          </>
        )}
        <div className="space-y-2">{lines.map((line) => lineOf(line))}</div>
      </div>
    );

  // A photo may evidence a line that is not in the slot it was taken at (a
  // day-grain "berries 1 serving/day", a week-grain "fatty fish 3x/week"), so
  // the lookup spans the whole view. An id we cannot name returns null and the
  // panel shows the verdict without a title rather than inventing one.
  const commitmentTitleOf = (commitmentId: string): string | null => {
    for (const group of data.view.slots) {
      for (const line of group.lines) {
        if (line.commitment.id === commitmentId) return line.commitment.title;
      }
    }
    for (const line of data.view.weekLines) {
      if (line.commitment.id === commitmentId) return line.commitment.title;
    }
    return null;
  };

  /**
   * ONE CAMERA PER BUCKET, whatever the sections do.
   *
   * The meal headings now recur: "breakfast" can appear under "Every day" AND
   * under "Supplements" ("D3 with breakfast"), which is correct — the coach
   * wrote both. But `pendingPhoto` is keyed by slot, so two buttons for the same
   * breakfast would open two composers over one upload. The first occurrence in
   * render order takes the camera; the rest get nothing.
   *
   * Rebuilt on every render, deliberately: it is a per-pass ledger, not state.
   */
  const cameraGiven = new Set<string>();

  /**
   * The camera, for one bucket. Rendered on the meal slots of FOOD and on its
   * unanchored everyday lines — nowhere else. A plate is the thing a photo
   * evidences; offering the camera under "Sleep" would be offering a gesture
   * with no reading behind it (`analyze-meal-photo-v1` reads food, and only
   * food). The unanchored bucket keeps its camera because "2 L of water, any
   * time" is still something a student may want to show.
   */
  const photoAffordance = (bucketKey: string) => {
    if (cameraGiven.has(bucketKey)) return null;
    cameraGiven.add(bucketKey);
    return (
    <>
      {pendingPhoto?.slotKey === bucketKey
        ? (
          <PhotoComposer
            pending={pendingPhoto}
            busy={photoBusy}
            error={photoError}
            onPick={onPickPhoto}
            onSend={onSendPhoto}
            onCancel={closePhoto}
          />
        )
        : (
          // Le POINTILLÉ dit « il y a une place ici, elle est libre » — c'est
          // exactement ce que `Card tone="dashed"` dit partout ailleurs dans le
          // produit, et c'est une forme, pas une teinte. Le bleu ciel qu'il
          // portait ne disait rien et rendait muette la pastille `info`.
          <button
            type="button"
            onClick={() => onOpenPhoto(bucketKey)}
            className="mt-2 w-full rounded-card border border-dashed border-line-strong px-3 py-2 text-left text-xs font-medium text-ink hover:bg-fig-50"
          >
            {t("photo.button")}
            <span className="mt-0.5 block font-normal text-ink-soft">
              {t("photo.button_hint")}
            </span>
          </button>
        )}

      {photoOutcome?.slotKey === bucketKey && (
        <PhotoOutcomePanel result={photoOutcome.result} titleOf={commitmentTitleOf} />
      )}
    </>
    );
  };

  /**
   * WHAT I EAT, INSIDE ONE OF THE COACH'S HEADINGS.
   *
   * Same heading as the import screen; the order under it is the student's. The
   * meals first, in vocabulary order — you eat from waking to bedtime — then
   * what names no moment, then what is judged on the week.
   */
  const foodBody = (subsection: PlanSubsection<TodayLine>) => {
    const { day, week } = splitByGrain(subsection.lines);
    const reading = slotReading(data.view, day);
    return (
      <>
        {reading.slots.map((group) => (
          <section key={group.slotKey}>
            {/* L'en-tête de créneau est l'étiquette la plus utile de la journée:
                elle garde le cran `text-label` de la charte comme les autres, mais
                en encre PLEINE (`ink`, 16,18:1) là où les sous-groupes sont en
                `ink-soft`. La hiérarchie se fait au contraste, pas à une taille
                hors échelle. Et l'heure passe de `gray-300` — 1,57:1 sur le
                papier, c'est-à-dire illisible — à `ink-soft` (6,11:1). */}
            <h4 className="mb-2 flex items-baseline gap-2 text-label font-semibold uppercase text-ink">
              {t("today.slot_header", { slot: slotLabel(group.slotKey) })}
              {group.defaultLocalTime && (
                <span className="text-xs font-normal normal-case tracking-normal tabular-nums text-ink-soft">
                  {group.defaultLocalTime.slice(0, 5)}
                </span>
              )}
            </h4>
            <div className="space-y-2">{group.lines.map((line) => lineOf(line))}</div>

            {/* PHOTO — one per SLOT, not per line: a plate is one image that
                may speak to several commitments, and forcing the student to
                pick one first would manufacture a binding the image may not
                support. */}
            {photoAffordance(group.slotKey)}
          </section>
        ))}

        {reading.free.length > 0 && (
          <section>
            <h4 className="mb-2 text-label font-semibold uppercase text-ink-soft">
              {t("today.free_section")}
            </h4>
            <div className="space-y-2">{reading.free.map((line) => lineOf(line))}</div>
            {photoAffordance(NO_SLOT_BUCKET)}
          </section>
        )}

        {weekBlock(week, subsection.key !== "every_week")}
      </>
    );
  };

  /** WHAT I DO, inside one family. No occasion reading: see the header note. */
  const actionBody = (subsection: PlanSubsection<TodayLine>) => {
    const { day, week } = splitByGrain(subsection.lines);
    return (
      <>
        {day.length > 0 && (
          <div className="space-y-2">{day.map((line) => lineOf(line))}</div>
        )}
        {/* A family heading never says "this week" on its own, so the caption
            always travels with the lines that need it. */}
        {weekBlock(week, true)}
      </>
    );
  };

  return (
    <KeelAppShell
      title={data.planVersion.title || t("app.plan_untitled")}
      subtitle={t("today.subtitle")}
    >
      {/* Coverage strip. THE GATE: below 4/7 there is no percentage anywhere on
          this page — `insufficient_data` is the whole message. */}
      {/* ⚠️ `bg-gray-50` NE POUVAIT PAS devenir `bg-paper`: `paper` EST le sol de
          la page, la bande aurait disparu. C'est une carte, elle prend donc le
          cadre de `ui/Card.tsx` — même remplissage que le sol, et un trait de
          contrôle. C'est la direction de la charte: une fiche technique a des
          cases tracées, pas des aplats. */}
      <section className="mb-4 rounded-card border border-line-strong bg-paper p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <span className="text-label font-semibold uppercase text-ink-soft">
              {t("today.coverage_label")}
            </span>
            {/* ⛔ UNE MESURE NE PORTE JAMAIS LA MARQUE (charte §2). */}
            <div className="text-lg font-semibold tabular-nums text-ink">
              {t("today.coverage_value", {
                logged: data.loggedDays,
                total: WEEK_DAYS,
              })}
            </div>
          </div>
          {/* ⚠️ `text-right` SEUL était faux sous `sm`, et ça se voit au rendu:
              la rangée passe en `flex-wrap`, la colonne de droite descend et se
              dimensionne alors sur son contenu — la pastille se retrouvait
              alignée à droite d'une boîte étroite, c'est-à-dire indentée au
              hasard au milieu de l'écran. Elle s'aligne à gauche quand elle est
              empilée, à droite quand elle est en vis-à-vis. */}
          <div className="min-w-0 text-left sm:text-right">
            {/* PASTILLE MAISON → `Badge`. Ton `neutral`, et c'est la copie qui le
                tranche: « adherence stays hidden … that is the rule, not a
                punishment ». Ce n'est donc ni une attention, ni un échec — c'est un
                LIBELLÉ sur la couverture. `bg-line text-ink-soft` = 4,72:1. */}
            {!gateOpen && <Badge>{t("today.insufficient_data")}</Badge>}
            <div className="mt-1 text-xs text-ink-soft">
              {t("today.flex_remaining", { count: data.flexLeft })}
            </div>
          </div>
        </div>
        {!gateOpen && (
          <p className="mt-2 max-w-[62ch] text-xs leading-5 text-ink-soft">
            {t("today.insufficient_data_hint", { min: LOGGING_COVERAGE_MIN_DAYS })}
          </p>
        )}
      </section>

      {/* THE DAY BY FAMILY — one glance answers "what held and what did not",
          which the slot order alone could never answer. */}
      <FamilyTallyStrip tallies={data.view.familyTallies} gateOpen={gateOpen} />

      {/* DEVIATION — first class, above the plan, never in a menu. */}
      <section className="mb-5">
        {dialogOpen
          ? (
            <DeviationDialog
              slotVocabulary={data.slotVocabulary}
              today={data.today}
              tomorrow={addDays(data.today, 1)}
              submitting={deviationSubmitting}
              error={deviationError}
              onSubmit={onDeclare}
              onClose={() => setDialogOpen(false)}
            />
          )
          : (
            // ⛔ LE DÉCLENCHEUR ÉTAIT VIOLET, ET C'EST LA MARQUE D'UN PRODUIT
            // SUPPRIMÉ. Ce qui tient son rang de « first class » n'était pas la
            // teinte de toute façon: c'est d'occuper la LARGEUR ENTIÈRE, d'être
            // au-dessus du plan, et de porter deux lignes là où le reste de
            // l'écran n'en porte qu'une. Les valeurs sont celles de
            // `Button variant="secondary"` — contour de contrôle `line-strong`,
            // survol `fig-50` — parce que ce bouton EST un geste secondaire tant
            // que le panneau n'est pas ouvert; l'action figue de l'écran est le
            // « Déclarer » qui se trouve dedans.
            <button
              type="button"
              onClick={() => {
                setFlash(null);
                setDialogOpen(true);
              }}
              className="w-full rounded-card border border-line-strong bg-paper px-4 py-3 text-left text-sm font-medium text-ink transition-colors hover:bg-fig-50"
            >
              {t("today.flex_button")}
              <span className="mt-0.5 block max-w-[62ch] text-xs font-normal leading-5 text-ink-soft">
                {t("deviation.subtitle")}
              </span>
            </button>
          )}
        {/* ⛔ ÉMERAUDE, ET C'EST UN ARBITRAGE À RELIRE. Cet accusé est
            « grounded »: il est construit à partir de la LIGNE QU'ON VIENT DE
            RELIRE en base. C'est donc un enregistrement confirmé — le cas que le
            socle nomme explicitement comme un fait qui reste (`text-emerald-700`
            d'un enregistrement confirmé). Et il ne s'agit pas d'importer une
            couleur d'ailleurs: `PhotoOutcomePanel`, dans ce même fichier, dit
            déjà « la photo est enregistrée » en `emerald-50`. Le violet, lui, ne
            disait rien. */}
        {flash && (
          <p className="mt-2 rounded-card bg-emerald-50 p-2 text-xs leading-5 text-emerald-900">
            {flash}
          </p>
        )}
      </section>

      {/* LES DÉVIATIONS DÉJÀ DÉCLARÉES. Neutres, et volontairement: ce n'est ni
          ok, ni attention, ni échec — c'est une note au dossier de la journée. Le
          bleu de `info` serait le seul candidat, et le dépenser sur une liste de
          bandeaux rendrait muette la pastille qui en a besoin ailleurs. La pièce
          se lit par la forme: remplissage `paper-2` fermé par un trait `line`. */}
      {data.view.deviations.length > 0 && (
        <section className="mb-4 space-y-1">
          {data.view.deviations.map((d) => (
            <p
              key={d.id}
              className="rounded-card border border-line bg-paper-2 px-3 py-2 text-xs leading-5 text-ink"
            >
              {d.slot_key
                ? t("today.deviation_banner_slot", {
                  slot: slotLabel(d.slot_key),
                  kind: deviationKindLabel(d.kind),
                })
                : t("today.deviation_banner", {
                  kind: deviationKindLabel(d.kind),
                })}
            </p>
          ))}
        </section>
      )}

      {/* ⛔ UN FAIT: rouge = échec, dans la famille `red` du produit. */}
      {logError && (
        <p className="mb-3 rounded-card bg-red-50 p-2 text-xs leading-5 text-red-700">
          {t("today.log_error")}
        </p>
      )}

      {data.view.totalLines === 0
        ? (
          <p className="rounded-card border border-dashed border-line-strong p-6 text-center text-sm text-ink-soft">
            {t("today.empty")}
          </p>
        )
        : (
          <div className="space-y-5">
            {/* THE COACH'S SECTIONS, IN THE COACH'S ORDER. What I eat, what I
                do, what is only watched — and under each, the coach's own
                headings. The observations come last and quiet because
                `PLAN_PART_ORDER` puts them there, not because this page felt
                like it: a weigh-in is not a promise, and printing it among the
                promises is how a student starts reading their weight as a
                grade. */}
            {structure.sections.map((section) => (
              <DayPart key={section.part} section={section}>
                {section.subsections.length > 0
                  ? section.subsections.map((subsection) => (
                    <DaySubsection key={subsection.key} subsection={subsection}>
                      {section.part === "food"
                        ? foodBody(subsection)
                        : actionBody(subsection)}
                    </DaySubsection>
                  ))
                  : (
                    <div className="space-y-2">
                      {section.lines.map((line) => lineOf(line))}
                    </div>
                  )}
              </DayPart>
            ))}
          </div>
        )}

      <p className="mt-6 max-w-[62ch] border-t border-line pt-3 text-xs leading-5 text-ink-soft">
        {t("today.derived_note")}
      </p>
    </KeelAppShell>
  );
}
