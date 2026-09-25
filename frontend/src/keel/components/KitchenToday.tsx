import React from "react";

import { addDays, dayTokenOf } from "../api/dates";
import { waveAssignments } from "../api/groceryWaves";
import type { GeneratedMealResult } from "../api/mealGeneration";
import { dishDayLabel, mealCopy } from "../api/mealLabels";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import CookingSessions from "./CookingSessions";
import ShoppingListPanel from "./ShoppingListPanel";

// CE QUE LA JOURNÉE DEMANDE — cuisiner, acheter, ou rien.
//
// ── LE TROU QUE ÇA BOUCHE ──────────────────────────────────────────────────
// `/app/today` répondait à « qu'est-ce que je mange » et jamais à « qu'est-ce
// que j'ai à faire ». Les deux seuls gestes que le plan DEMANDE à une journée
// — la session de cuisine et les courses — n'existaient que sur `/app/plan`,
// derrière deux boutons, dans un écran qui montre la semaine entière. Un
// dimanche de cuisson ou un jeudi de courses ne se voyaient donc nulle part le
// jour où ils tombent, et l'élève découvrait mardi soir que le chili qu'il
// devait cuisiner dimanche n'existe pas.
//
// ── AUJOURD'HUI ET DEMAIN, PAS LA SEMAINE ──────────────────────────────────
// La semaine entière vit sur `/app/plan` et y reste: la remettre ici ferait
// deux écrans qui montrent la même chose, et celui-ci s'appelle « Today ».
//
// DEMAIN est la moitié utile. On ne prépare pas une session de cuisine le matin
// même, et on ne décide pas d'un détour par le magasin en arrivant devant.
// C'est la veille au soir que ça se joue — c'est-à-dire en lisant cet écran.
//
// ── RIEN À FAIRE EST UNE RÉPONSE, ET ELLE SE DIT ───────────────────────────
// Une semaine bien préparée est une semaine où la plupart des jours n'ont RIEN
// à cuisiner: c'est le produit qui marche, pas un trou. La carte le nomme
// (« today is assembling ») au lieu de disparaître — un bloc qui s'efface les
// jours sans cuisson apprend à ne plus le chercher les jours où il compte.
//
// Elle disparaît en revanche quand il n'y a NI plan, NI courses, NI session:
// là, il n'y a rien à dire, et le reste de l'écran le dit déjà.

/** Ce que la journée réclame, résolu une fois pour les deux blocs. */
type CookingSessionRow = GeneratedMealResult["cookingSessions"][number];

interface KitchenDay {
  /**
   * ⟳ 2026-09-23 — TOUTES les sessions du jour, pas la première. Un plan peut
   * en poser deux le même jour (mesuré: 55 min + 15 min le mercredi), et
   * `find` cachait la seconde en silence.
   */
  cookToday: CookingSessionRow[];
  cookTomorrow: CookingSessionRow[];
  /**
   * LA COURSE QUI COMPTE — la prochaine à venir, ou la dernière ratée.
   *
   * `when` dit laquelle des deux: une course en retard et une course à venir se
   * lisent différemment, et c'est la première qui est urgente.
   */
  shop:
    | { when: "today" | "tomorrow" | "later" | "overdue"; buyOn: string; count: number }
    | null;
}

function resolveDay(
  meals: GeneratedMealResult | null,
  todayDate: string,
): KitchenDay {
  const empty: KitchenDay = { cookToday: [], cookTomorrow: [], shop: null };
  if (!meals) return empty;

  const tomorrowDate = addDays(todayDate, 1);
  // LA SESSION PORTE UN JETON DE JOUR (« sun »), PAS UNE DATE. C'est le format
  // que le moteur écrit et que `dishDayLabel` sait nommer; le convertir ici
  // plutôt qu'en base garde une seule source pour « quel jour est aujourd'hui ».
  const todayToken = dayTokenOf(todayDate);
  const tomorrowToken = dayTokenOf(tomorrowDate);

  const sessions = meals.cookingSessions ?? [];
  const cookToday = sessions.filter((s) => s.day === todayToken);
  const cookTomorrow = sessions.filter((s) => s.day === tomorrowToken);

  // LES VAGUES VIENNENT DE LA MÊME LECTURE QUE LE PANNEAU DE COURSES
  // (`waveAssignments`): deux sources pour une même répartition divergeraient
  // au premier changement de règle, et c'est l'écran le moins regardé qui
  // garderait l'ancienne.
  //
  // ⟳ 2026-09-25 — ET CETTE LECTURE PREND D'ABORD LES DATES ÉCRITES (`buy_on`).
  // Elle recalculait ici sans le nombre de courses choisi ni les jours de
  // repas: « aujourd'hui » annonçait une seule course là où le plan en posait
  // deux. Le recalcul ne sert plus qu'aux plans écrits avant les dates.
  const waves = meals.startsOn
    ? waveAssignments({
      startsOn: meals.startsOn,
      durationDays: meals.durationDays ?? 7,
      shoppingList: meals.shoppingList ?? [],
      preparations: meals.preparations ?? [],
    })
    : [];

  // LA PROCHAINE COURSE, ou la dernière ratée. Les vagues sortent triées par
  // date; on prend la première qui n'est pas derrière, et à défaut la dernière
  // qui l'est — parce que « tu devais faire les courses jeudi » est une
  // information, et que se taire laisserait un frigo vide sous un écran normal.
  const upcoming = waves.find((w) => w.buyOn >= todayDate) ?? null;
  const lastPast = [...waves].reverse().find((w) => w.buyOn < todayDate) ?? null;
  const chosen = upcoming ?? lastPast;
  const shop: KitchenDay["shop"] = chosen
    ? {
      when: !upcoming
        ? "overdue"
        : chosen.buyOn === todayDate
        ? "today"
        : chosen.buyOn === tomorrowDate
        ? "tomorrow"
        : "later",
      buyOn: chosen.buyOn,
      count: chosen.indices.length,
    }
    : null;

  return { cookToday, cookTomorrow, shop };
}

export default function KitchenToday(
  { meals, todayDate }: {
    meals: GeneratedMealResult | null;
    /** `YYYY-MM-DD` dans le fuseau du navigateur — la même que les coches. */
    todayDate: string;
  },
) {
  const [sessionsOpen, setSessionsOpen] = React.useState(false);
  const [shoppingOpen, setShoppingOpen] = React.useState(false);

  const day = React.useMemo(() => resolveDay(meals, todayDate), [meals, todayDate]);

  // Sans composition, cet écran n'a rien à dire sur la cuisine: le reste de la
  // page porte déjà « tu n'as pas encore de plan ».
  if (!meals) return null;
  const sessions = meals.cookingSessions ?? [];
  const hasAnything = sessions.length > 0 ||
    (meals.shoppingList ?? []).length > 0;
  if (!hasAnything) return null;

  const prepTitles = (session: CookingSessionRow) => {
    const byId = new Map((meals.preparations ?? []).map((p) => [p.id, p]));
    return session.preparation_ids
      .map((id) => byId.get(id)?.title)
      .filter((t): t is string => Boolean(t))
      .join(", ");
  };

  // Le temps d'une journée de cuisine: la somme de ses sessions. `null` quand
  // aucune ne déclare de durée — on n'affiche pas « 0 min ».
  const totalMinutes = (rows: CookingSessionRow[]): number | null => {
    const known = rows
      .map((s) => s.total_minutes)
      .filter((n): n is number => typeof n === "number");
    return known.length > 0 ? known.reduce((a, b) => a + b, 0) : null;
  };
  const todayMinutes = totalMinutes(day.cookToday);
  const tomorrowMinutes = totalMinutes(day.cookTomorrow);

  // ⟳ 2026-09-23 — AUCUNE PHRASE DE TIMING SUR CET ÉCRAN, sur demande du
  // propriétaire (« ça doit apparaître que sur le plan, pas dans aujourd'hui,
  // ça pollue »). Les trois — « la veille », « dès le matin », « ta journée est
  // déjà entamée » — vivaient en tête de cette carte. Les deux premières restent
  // sur `/app/plan` (`PlanResult`), dans le bloc de leur jour; la troisième
  // n'avait plus d'autre lecteur, et sa clé est retirée des deux packs.

  return (
    <section>
      <SectionLabel>{mealCopy("meals.today.title")}</SectionLabel>
      <Card>
        {/* ── CUISINE ─────────────────────────────────────────────────────── */}
        {day.cookToday.length > 0
          ? (
            <div>
              <p className="text-sm font-semibold text-ink">
                {mealCopy("meals.today.cook_today")}
                {todayMinutes !== null && (
                  <span className="ml-2 text-xs font-normal tabular-nums text-ink-soft">
                    {mealCopy("meals.sessions.session_time").replace(
                      "{n}",
                      String(todayMinutes),
                    )}
                  </span>
                )}
              </p>
              {day.cookToday.map((session, i) => {
                const titles = prepTitles(session);
                return (
                  <div
                    key={`${session.day}:${i}`}
                    className={i > 0 ? "mt-3 border-t border-line pt-3" : ""}
                  >
                    {titles && (
                      <p className="mt-1 text-sm text-ink">
                        {mealCopy("meals.today.makes").replace("{titles}", titles)}
                      </p>
                    )}
                    {/* LE DÉROULÉ EST LA RAISON D'ÊTRE DE LA SESSION: l'ordre des
                        gestes se joue ENTRE les préparations, et c'est ce qu'on
                        lit avant de commencer. Le renvoyer derrière un bouton
                        sur l'écran du jour même ferait rouvrir la semaine pour
                        la seule phrase qui compte aujourd'hui. */}
                    {session.run_through && (
                      <p className="mt-2 text-sm leading-6 text-ink">
                        {session.run_through}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )
          : day.cookTomorrow.length > 0
          ? (
            <p className="text-sm text-ink">
              {mealCopy("meals.today.cook_tomorrow")}
              {tomorrowMinutes !== null && (
                <span className="ml-2 text-xs tabular-nums text-ink-soft">
                  {mealCopy("meals.sessions.session_time").replace(
                    "{n}",
                    String(tomorrowMinutes),
                  )}
                </span>
              )}
            </p>
          )
          : sessions.length > 0
          ? (
            <p className="text-sm text-ink-soft">
              {mealCopy("meals.today.assembling")}
            </p>
          )
          : null}

        {/* ── COURSES ─────────────────────────────────────────────────────── */}
        {day.shop
          ? (
            <div className="mt-4 border-t border-line pt-3">
              <p
                className={`text-sm font-semibold ${
                  // AMBRE SUR LE RETARD, ET SEULEMENT LÀ. C'est le seul des
                  // quatre états où quelque chose ne va pas; colorer aussi
                  // « courses demain » ferait de la couleur une décoration, et
                  // on cesserait de la voir le jour où elle dit quelque chose.
                  day.shop.when === "overdue" ? "text-amber-800" : "text-ink"
                }`}
              >
                {day.shop.when === "today"
                  ? mealCopy("meals.today.shop_today")
                  : day.shop.when === "tomorrow"
                  ? mealCopy("meals.today.shop_tomorrow")
                  : day.shop.when === "overdue"
                  ? mealCopy("meals.today.shop_overdue").replace(
                    "{day}",
                    dishDayLabel(dayTokenOf(day.shop.buyOn)) ?? day.shop.buyOn,
                  )
                  : mealCopy("meals.today.shop_on").replace(
                    "{day}",
                    dishDayLabel(dayTokenOf(day.shop.buyOn)) ?? day.shop.buyOn,
                  )}
              </p>
              <p className="mt-1 text-sm text-ink">
                {mealCopy("meals.today.shop_items").replace(
                  "{n}",
                  String(day.shop.count),
                )}
              </p>
            </div>
          )
          : null}

        {/* Les deux fenêtres sont celles de `/app/plan`, pas des copies: la
            liste de courses et les sessions ont chacune UN rendu, et il porte
            déjà les rayures, les vagues et l'export PDF. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {(meals.shoppingList ?? []).length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShoppingOpen(true)}
            >
              {mealCopy("meals.today.shop_open")}
            </Button>
          )}
          {sessions.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSessionsOpen(true)}
            >
              {mealCopy("meals.today.sessions_open")}
            </Button>
          )}
        </div>

        {/* Le jour de la session suivante, quand elle n'est ni aujourd'hui ni
            demain: sans repère, « today is assembling » ne dit pas jusqu'à
            quand. */}
        {day.cookToday.length === 0 && day.cookTomorrow.length === 0 &&
          sessions.length > 0 && (
          <p className="mt-3 text-xs text-ink-soft">
            {sessions
              .map((s) => dishDayLabel(s.day) ?? s.day)
              .join(" · ")}
          </p>
        )}
      </Card>

      <ShoppingListPanel
        items={meals.shoppingList ?? []}
        mealId={meals.mealId ?? null}
        open={shoppingOpen}
        onClose={() => setShoppingOpen(false)}
        preparations={meals.preparations ?? []}
        startsOn={meals.startsOn ?? null}
        durationDays={meals.durationDays ?? null}
      />
      <CookingSessions
        sessions={sessions}
        preparations={meals.preparations ?? []}
        dishes={meals.dishes ?? []}
        shoppingList={meals.shoppingList ?? []}
        // ── LOT 4 · LES PRÉNOMS DES BOÎTES, SUR CET ÉCRAN AUSSI ─────────────
        // Sans cette ligne, la table de pesée de `/app/today` rendait « Une
        // boîte — 120 g » autant de fois qu'il y a de bouches: trois grammages
        // anonymes, c'est-à-dire une instruction que personne ne peut exécuter.
        // (Mesuré le 2026-08-17 par la vérification du LOT 4; la prop était
        // optionnelle, donc le compilateur n'avait rien à dire.)
        //
        // ⚠️ AUCUNE GARDE `isOwner` ICI, ET CE N'EST PAS UN OUBLI. `meals` vient
        // de `loadMealPlans`, qui est scopé `.eq("user_id", …)`: un secondaire
        // n'a AUCUNE ligne, donc `meals` est `null` et cet écran ne rend rien
        // du tout. Les parts affichées sont celles du plan de la personne qui
        // regarde — la même règle que `/app/plan`, où le maître voit la table
        // de pesée parce que c'est lui qui remplit les boîtes.
        portions={meals.memberPortions ?? []}
        open={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
      />
    </section>
  );
}

