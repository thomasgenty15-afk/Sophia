import React from "react";
import { useAuth } from "../../context/AuthContext";
import { dayTokenOf } from "../api/dates";
import { slotLabel } from "../api/labels";
import { signMealPhotoUrls } from "../api/mealPhoto";
import { type JournalEnergy, loadJournalTracking } from "../api/tracking";
import { type DayToken } from "../api/types";
import {
  dishDaySplit,
  type GeneratedDish,
  type GeneratedMealResult,
  loadMealPlans,
} from "../api/mealGeneration";
import { mealCopy } from "../api/mealLabels";
import { browserLocalDate, useMealTicks } from "../lib/useMealTicks";
import DishCard from "../components/DishCard";
import { DayEnergyLine } from "../components/plan/EnergyReadout";
import { useMealEnergy } from "../lib/useMealEnergy";
import KeelAppShell from "../components/KeelAppShell";
import KitchenToday from "../components/KitchenToday";
import { boxLinesForDish } from "../lib/mealBoxes";
import { Button, ButtonLink } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { t } from "../i18n/t";

// KEEL — /app/today. LA JOURNÉE, ET RIEN D'AUTRE.
//
// ═══════════════════════════════════════════════════════════════════════════
// CE QUE CET ÉCRAN MONTRE, ET LA LISTE EST FERMÉE (2026-09-09)
// ═══════════════════════════════════════════════════════════════════════════
//   1. ce que la journée DEMANDE — la session de cuisine et les courses
//      (`KitchenToday`), avant les plats: un jour de cuisson découvert après
//      le dîner ne sert plus à rien;
//   2. les PLATS du jour, avec leur case « j'ai mangé ça » — la MÊME case que
//      `/app/plan`, par la même liaison (`useMealTicks`);
//   3. le CHIFFRE du jour et celui de chaque plat, quand les portes sont
//      ouvertes, avec la bascule qui l'éteint;
//   4. les PHOTOS prises aujourd'hui, quel que soit le créneau.
//
// ── CE QUI EST PARTI, ET POURQUOI CE N'EST PAS UNE PERTE ───────────────────
// Cet écran lisait `plan_versions` — le plan qu'un COACH publie — et rendait
// par-dessus toute la machinerie de la prescription 1:1: la bande de
// couverture (« 2 sur 7 jours notés »), le décompte par famille, le bouton
// « Déclarer un écart », les lignes d'engagement à cocher une par une, la
// caméra par créneau, et la note de bas de page sur la façon dont la journée
// est évaluée.
//
// Rien de tout ça n'a de sujet dans le produit qu'on vend: le foyer compose sa
// semaine sur `/app/plan`, personne ne lui prescrit une journée, donc « l'a-t-il
// suivie » n'a rien à mesurer. La chaîne de prescription individuelle
// (`plan_versions`, `/coach/import`, `/coach/templates`) reste en place et
// intacte — c'est un mode gardé exprès (CLAUDE.md). Ce qui a été retiré, c'est
// son rendu sur l'écran quotidien du foyer, pas la chaîne.
//
// ⚠️ `DeviationDialog`, `CommitmentLine` et `api/todayModel.ts` n'ont plus
// d'appelant DEPUIS CET ÉCRAN. Ils ne sont pas supprimés: `todayModel` a ses
// épreuves (`keelModels.int.test.ts`) et `CommitmentLine` sert encore
// `WeekView`. Ne les efface pas « puisque plus rien ne les monte » sans avoir
// relu ce paragraphe.
//
// ⚠️ ET UNE VINGTAINE DE CLÉS `today.*` N'ONT PLUS DE LECTEUR — `own_week_*`,
// `family_tally_*`, `coverage_*`, `insufficient_data*`, `flex_*`,
// `deviation_banner*`, `week_section*`, `free_section`, `greeting`, `empty`,
// `slot_header`, `logged_badge`, `log_error`, `own_lines_label`. Elles sont
// LAISSÉES EN PLACE, et c'est un choix, pas un oubli: seules les clés que la
// demande nommait ont été retirées des deux packs (`today.subtitle`,
// `today.derived_note`, les trois `no_plan_preview*`/`no_plan_footer`). Purger
// les autres est un lot à part — plusieurs voisines de la même famille servent
// encore `CommitmentLine` et `WeekView`, et le tri se fait clé par clé.

/** Une photo prise aujourd'hui, prête à afficher. */
interface TodayPhoto {
  id: string;
  /** Le créneau déclaré à l'envoi. `null` quand la photo n'en nomme aucun. */
  slot: string | null;
  /** Le repas auquel elle est rattachée, quand il en a un. */
  title: string | null;
  /** L'URL signée. `null` = l'échange a échoué; la ligne reste, sans image. */
  url: string | null;
  note: string | null;
  energy: JournalEnergy | null;
}

/**
 * LE CRÉNEAU, SANS FAIRE TOMBER L'ÉCRAN.
 *
 * `slotLabel` lève sur un jeton qu'il ne connaît pas — c'est la bonne règle
 * là où le jeton vient d'un vocabulaire fermé. Ici il vient du journal, donc
 * d'une déclaration passée: un jeton retiré du vocabulaire depuis rendrait la
 * journée entière illisible. On rend alors le jeton brut.
 */
function safeSlotLabel(slot: string | null): string | null {
  if (!slot) return null;
  try {
    return slotLabel(slot);
  } catch {
    return slot;
  }
}

/**
 * LE CHIFFRE D'UNE PHOTO, AVEC SA BASE DANS LA MÊME PHRASE — CALORIE_REVERSAL §6.
 *
 * ⛔ LA BASE EST DANS LA CLÉ, PAS À CÔTÉ: la chaîne vient d'une clé i18n NOMMÉE
 * PAR LA BASE (`photo.energy.<basis>`), qui interpole le nombre DANS la phrase.
 * Il n'existe donc aucun chemin où le nombre s'affiche et la base non.
 *
 * ⚠️ LE DÉFAUT EST `photo_estimate`, ET C'EST LE CÔTÉ SÛR: une base inconnue —
 * une ligne écrite par une version future — se rend comme la moins fiable des
 * deux, jamais comme la plus rassurante.
 */
function photoEnergyLine(energy: JournalEnergy | null): string | null {
  if (!energy) return null;
  const kcal = Number(energy.kcal);
  // `Number.isFinite`, pas une vérité: `Number(null)` vaut 0, et 0 est « faux ».
  if (!Number.isFinite(kcal) || kcal <= 0) return null;
  if (energy.basis === "declared_quantities" || energy.basis === "plan_quantities") {
    return t("photo.energy.declared_quantities", { kcal });
  }
  return t("photo.energy.photo_estimate", { kcal });
}

/**
 * LES PHOTOS DU JOUR — celles qui existent, jamais un emplacement inventé.
 *
 * ⚠️ LA SECTION RESTE QUAND IL N'Y EN A AUCUNE, et c'est le point: c'est la
 * PLACE de la photo qu'on montre. Un bloc qui s'efface les jours sans photo
 * apprend à ne plus le chercher les jours où on en a pris une.
 *
 * ⛔ ON N'ENVOIE PAS D'ICI. Le geste vit dans le « + » de la barre du bas et
 * dans le composeur de `/app/chat`, qui portent déjà l'aperçu avant envoi, le
 * choix du créneau et les deux refus (type, taille). Un second envoyeur ici
 * ferait deux implémentations de la même chose, et c'est celle qu'on relit le
 * moins qui garderait l'ancienne règle.
 */
function TodayPhotos({ photos }: { photos: readonly TodayPhoto[] }) {
  return (
    <section>
      <SectionLabel>{t("today.photos_label")}</SectionLabel>
      {photos.length === 0
        ? (
          <Card tone="dashed">
            <p className="max-w-[62ch] text-sm leading-6 text-ink-soft">
              {t("today.photos_empty")}
            </p>
          </Card>
        )
        : (
          <div className="space-y-3">
            {photos.map((photo) => {
              const slot = safeSlotLabel(photo.slot);
              const line = photoEnergyLine(photo.energy);
              return (
                <Card key={photo.id}>
                  <div className="flex min-w-0 gap-3">
                    {photo.url
                      ? (
                        // `alt=""`: l'image est DÉCORATIVE au sens strict — tout
                        // ce qu'elle porte (le créneau, le plat, le chiffre) est
                        // écrit à côté. Un `alt` inventé décrirait une assiette
                        // que personne n'a lue.
                        <img
                          src={photo.url}
                          alt=""
                          className="h-16 w-16 shrink-0 rounded-card border border-line object-cover"
                        />
                      )
                      : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        {slot && (
                          <span className="text-label font-semibold uppercase text-ink">
                            {slot}
                          </span>
                        )}
                        {photo.title && (
                          <span className="truncate text-sm text-ink-soft">
                            {photo.title}
                          </span>
                        )}
                      </div>
                      {photo.note && (
                        <p className="mt-1 max-w-[62ch] whitespace-pre-wrap text-sm leading-6 text-ink-soft">
                          {photo.note}
                        </p>
                      )}
                      {line && (
                        <p className="mt-1 text-xs leading-5 text-ink-soft">{line}</p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
    </section>
  );
}

/**
 * PAS DE PLAN POUR AUJOURD'HUI — et c'est le TOUR DE LA PERSONNE, pas celui
 * d'un coach.
 *
 * Ce bloc a dit « ton coach prépare ton plan ». C'était faux dans le modèle
 * qu'on livre: personne n'écrit la semaine de quelqu'un d'autre, `/app/plan`
 * est l'endroit où on la compose. Faire attendre quelqu'un dont c'est le tour
 * est la pire chose qu'un écran vide puisse faire, donc le bloc porte la
 * sortie.
 */
function NoPlanYet() {
  return (
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
  );
}

/**
 * LA JOURNÉE COMPOSÉE — ce que `/app/plan` a écrit, rendu le jour où on le mange.
 *
 * LES COCHES SONT CELLES DE `/app/plan`, par la même liaison: le plat est le
 * même objet, la case doit être la même case.
 *
 * TOUT CE QUI EST RENDU ICI EST DATÉ D'AUJOURD'HUI — les plats du jour
 * (`dishes.today`) et ceux qui ne nomment aucun jour (`dishes.anyDay`), qu'on
 * rapporte le jour où on les mange. Le rattrapage des jours écoulés vit sur
 * `/app/plan`, seul écran à montrer la semaine entière.
 */
function TodayBody({
  meals,
  photos,
  day,
  todayDate,
}: {
  meals: GeneratedMealResult | null;
  photos: readonly TodayPhoto[];
  day: DayToken;
  todayDate: string;
}) {
  const { user } = useAuth();
  const dishes = meals ? dishDaySplit(meals.dishes, day) : null;
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
    // Un plan ÉCRIT: pas d'aperçu à chiffrer ici.
    draftId: null,
    dishes: meals?.dishes ?? [],
  });
  // La somme de CE jour, prise dans la table du plan — elle n'est pas
  // recalculée ici: c'est LA MÊME entrée que le titre de jour de `/app/plan`.
  const dayEnergy = energy.showing ? energy.forDay(day) : null;

  const dishCard = (dish: GeneratedDish, key: string) => (
    <DishCard
      key={key}
      dish={dish}
      tick={ticks.bind(dish, todayDate)}
      energy={energy.showing ? energy.forDish(dish) : null}
      boxEnergy={energy.hasBoxEnergy ? ((id) => energy.forBox(id)) : undefined}
      // ── LE COUVERCLE, LE JOUR OÙ ON L'OUVRE ───────────────────────────
      // C'est l'écran du jour J: la boîte de ce repas est ce qu'on sort du
      // frigo, et c'est là qu'on lit sa part. Résolue ici — la carte ne va
      // pas la chercher, deux lecteurs du même plan finissent par se
      // contredire.
      boxes={boxLinesForDish(dish, meals?.memberPortions ?? [])}
      // ⚠️ LA PASTILLE RESTE. `/app/plan` a des SECTIONS par moment et n'en a
      // plus besoin; cette liste-ci est plate — sans elle, rien ne dirait
      // lequel de ces plats est le petit-déjeuner.
      slotBadge
    />
  );

  return (
    <div className="space-y-6">
      {/* CE QUE LA JOURNÉE DEMANDE — avant les plats, et l'ordre compte: une
          session de cuisine ou une course se décident AVANT de lire ce qu'on
          mange. Rendu `null` quand il n'y a ni session ni liste. */}
      <KitchenToday meals={meals} todayDate={todayDate} />

      {dishes
        ? (
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <SectionLabel>{t("today.own_meals_label")}</SectionLabel>
              {/* FF-059 — la somme du jour, à côté du titre de la section qui
                  la produit. Absente quand une porte est fermée: il n'y a alors
                  aucun chiffre dans cet écran. */}
              <DayEnergyLine energy={dayEnergy} />
            </div>
            {/* ⛔ UN FAIT. Rouge = échec; `red-700` est la valeur du produit. */}
            {ticks.error && (
              <p className="mb-3 text-sm text-red-700">
                {mealCopy("meals.tick.failed")}
              </p>
            )}
            {dishes.today.length > 0
              ? (
                <div className="space-y-3">
                  {dishes.today.map((dish, i) => dishCard(dish, `d${i}-${dish.title}`))}
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
                  {dishes.anyDay.map((dish, i) => dishCard(dish, `a${i}-${dish.title}`))}
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════
                ⛔ NI LA FOURCHETTE, NI LA NOTE DE BASE — RETIRÉES SUR DEMANDE
                LE 2026-09-09, ET ÇA S'ÉCARTE D'UN CONTRAT ÉCRIT.

                Trois phrases vivaient ici: « Autour de 3036–3180 par jour pour
                prendre à ton rythme — d'après ta pesée du … », « Ta fourchette
                au poids, décalée du rythme que tu as réglé … », et « Calculé à
                partir des quantités de ton plan et d'une table de composition
                des aliments — pas deviné sur une photo. » Les deux premières
                sont `EnergyTargetNote`, la troisième `EnergyBasisNote`.

                ⚠️ CE QUE ÇA COÛTE, ÉCRIT ICI POUR QUE PERSONNE NE LE
                REDÉCOUVRE: `docs/keel/CALORIE_REVERSAL.md` §5 couche ④ dit
                « tout rendu qui affiche `kcal` affiche aussi sa base ». Les
                clés FF-059 (`meals.energy.dish`, `meals.energy.day`) portent le
                NOMBRE et pas la base — contrairement à `photo.energy.<basis>`,
                où la base est DANS la clé. Sur cet écran, `EnergyBasisNote`
                était donc la seule chose qui distinguait un CALCUL sur les
                quantités du plan (MAPE 2,3 %) d'une estimation devinée sur une
                photo (biais −26,6 %). Cet écran-ci ne le dit plus.

                ⛔ LE CONTRAT TIENT AILLEURS, ET C'EST CE QUI REND L'ÉCART
                SUPPORTABLE: `/app/plan` garde les deux notes (`PlanResult`,
                `CookingSessions`), et le chemin PHOTO — le seul où le chiffre
                est deviné — porte sa base dans la clé, ici comme ailleurs
                (voir `photoEnergyLine` plus haut). Ce qui est retiré est la
                note du chemin CALCULÉ, sur l'écran quotidien.

                Ne les remets pas « parce que le contrat les demande » sans
                repasser par la personne qui les a fait retirer.
                ═══════════════════════════════════════════════════════════ */}
            {energy.showing && (
              // ON L'ÉTEINT LÀ OÙ ON LE RENCONTRE. « Un chiffre qu'on ne peut
              // pas faire taire est un tracker. »
              // ⚠️ SEULEMENT L'EXTINCTION: on n'invite pas à allumer ici.
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => energy.toggle(false)}
                >
                  {mealCopy("meals.energy.switch_off")}
                </Button>
                {energy.error && (
                  <span className="text-xs text-red-700">
                    {mealCopy("meals.energy.switch_failed")}
                  </span>
                )}
              </div>
            )}
          </section>
        )
        : <NoPlanYet />}

      <TodayPhotos photos={photos} />
    </div>
  );
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
    kind: "ready";
    /** `null` = aucun plan ne couvre aujourd'hui, ou il ne porte aucun plat. */
    meals: GeneratedMealResult | null;
    photos: TodayPhoto[];
  };

/**
 * LES PHOTOS DU JOUR, LUES DANS LE JOURNAL.
 *
 * ⚠️ UNE PANNE ICI NE DOIT PAS EMPORTER LA JOURNÉE. Les plats et les courses
 * sont ce qu'on vient chercher; une lecture de photos en échec rend une liste
 * vide, et l'écran s'ouvre quand même.
 */
async function loadTodayPhotos(date: string): Promise<TodayPhoto[]> {
  const report = await loadJournalTracking({ from: date, to: date });
  const day = report.days.find((d) => d.date === date);
  if (!day) return [];
  const rows = day.meals.flatMap((meal) =>
    meal.events
      .filter((event) => event.mediaPath)
      .map((event) => ({
        id: event.id,
        // Le créneau de l'ÉVÉNEMENT d'abord: c'est celui qui a été déclaré à
        // l'envoi. Celui du repas ne sert que de repli.
        slot: event.slot ?? meal.slot,
        title: meal.title || null,
        path: event.mediaPath as string,
        note: event.note,
        energy: event.energy,
      }))
  );
  if (rows.length === 0) return [];
  // Le bucket est privé: sans cet échange, le navigateur ne peut pas lire un
  // objet même en connaissant son chemin. Un chemin refusé est simplement
  // absent du retour — la ligne reste, sans image.
  const urls: Record<string, string> = await signMealPhotoUrls(
    rows.map((row) => row.path),
  ).catch(() => ({}));
  return rows.map((row) => ({
    id: row.id,
    slot: row.slot,
    title: row.title,
    url: urls[row.path] ?? null,
    note: row.note,
    energy: row.energy,
  }));
}

export default function TodayPage() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });

  const load = React.useCallback(async () => {
    if (!userId) return;
    setState({ kind: "loading" });
    try {
      // ⚠️ LA DATE EST RELUE À CHAQUE CHARGEMENT, jamais figée au montage: un
      // onglet laissé ouvert la veille tient encore hier quand le serveur est
      // déjà à aujourd'hui.
      const todayDate = browserLocalDate();
      const [plans, photos] = await Promise.all([
        // ── LE PLAN COURANT, PAS LE DERNIER ÉCRIT ─────────────────────────
        // `loadMealPlans` rend le plan dont la FENÊTRE contient aujourd'hui.
        // « La dernière composition » servirait le dîner de la semaine
        // prochaine comme plat du soir.
        loadMealPlans(userId, todayDate),
        loadTodayPhotos(todayDate).catch(() => [] as TodayPhoto[]),
      ]);
      const current = plans.current;
      setState({
        kind: "ready",
        meals: current && current.dishes.length > 0 ? current : null,
        photos,
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
        {/* ⛔ UN FAIT: rouge = échec, dans la famille `red` du produit. */}
        <p className="rounded-card bg-red-50 p-3 text-sm text-red-700">
          {t("today.error")}
        </p>
        <p className="mt-2 break-words font-mono text-xs text-ink-soft">
          {state.message}
        </p>
      </KeelAppShell>
    );
  }

  const todayDate = browserLocalDate();
  return (
    <KeelAppShell title={t("today.title")}>
      <TodayBody
        meals={state.meals}
        photos={state.photos}
        // Le jour dans l'horloge du navigateur, la même que celle qui a écrit
        // la fenêtre du plan: en inventer un autre ferait lire mardi un lundi
        // soir.
        day={dayTokenOf(todayDate)}
        todayDate={todayDate}
      />
    </KeelAppShell>
  );
}
