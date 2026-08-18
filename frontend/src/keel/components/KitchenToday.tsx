import React from "react";
import { useNavigate } from "react-router-dom";

import { sendChatMessage } from "../api/chat";
import { addDays, dayTokenOf } from "../api/dates";
import { planGroceryWaves } from "../api/groceryWaves";
import type { GeneratedMealResult } from "../api/mealGeneration";
import { dishDayLabel, mealCopy } from "../api/mealLabels";
import { sessionMissedPayload } from "../lib/accidentPayload";
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
interface KitchenDay {
  cookToday: GeneratedMealResult["cookingSessions"][number] | null;
  cookTomorrow: GeneratedMealResult["cookingSessions"][number] | null;
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
  const empty: KitchenDay = { cookToday: null, cookTomorrow: null, shop: null };
  if (!meals) return empty;

  const tomorrowDate = addDays(todayDate, 1);
  // LA SESSION PORTE UN JETON DE JOUR (« sun »), PAS UNE DATE. C'est le format
  // que le moteur écrit et que `dishDayLabel` sait nommer; le convertir ici
  // plutôt qu'en base garde une seule source pour « quel jour est aujourd'hui ».
  const todayToken = dayTokenOf(todayDate);
  const tomorrowToken = dayTokenOf(tomorrowDate);

  const sessions = meals.cookingSessions ?? [];
  const cookToday = sessions.find((s) => s.day === todayToken) ?? null;
  const cookTomorrow = sessions.find((s) => s.day === tomorrowToken) ?? null;

  // LES VAGUES SONT RECALCULÉES ICI, à partir des mêmes entrées que le panneau
  // de courses. Pas recopiées: deux sources pour une même répartition
  // divergeraient au premier changement de règle, et c'est l'écran le moins
  // regardé qui garderait l'ancienne.
  const waves = meals.startsOn
    ? planGroceryWaves({
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
      count: chosen.items.length,
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

  const prepTitles = (session: typeof day.cookToday) => {
    if (!session) return "";
    const byId = new Map((meals.preparations ?? []).map((p) => [p.id, p]));
    return session.preparation_ids
      .map((id) => byId.get(id)?.title)
      .filter((t): t is string => Boolean(t))
      .join(", ");
  };

  const todayTitles = prepTitles(day.cookToday);

  return (
    <section>
      <SectionLabel>{mealCopy("meals.today.title")}</SectionLabel>
      <Card>
        {/* ── CUISINE ─────────────────────────────────────────────────────── */}
        {day.cookToday
          ? (
            <div>
              <p className="text-sm font-semibold text-ink">
                {mealCopy("meals.today.cook_today")}
                {day.cookToday.total_minutes !== null && (
                  <span className="ml-2 text-xs font-normal tabular-nums text-ink-soft">
                    {mealCopy("meals.sessions.session_time").replace(
                      "{n}",
                      String(day.cookToday.total_minutes),
                    )}
                  </span>
                )}
              </p>
              {todayTitles && (
                <p className="mt-1 text-sm text-ink">
                  {mealCopy("meals.today.makes").replace("{titles}", todayTitles)}
                </p>
              )}
              {/* LE DÉROULÉ EST LA RAISON D'ÊTRE DE LA SESSION: l'ordre des
                  gestes se joue ENTRE les préparations, et c'est ce qu'on lit
                  avant de commencer. Le renvoyer derrière un bouton sur l'écran
                  du jour même ferait rouvrir la semaine pour la seule phrase
                  qui compte aujourd'hui. */}
              {day.cookToday.run_through && (
                <p className="mt-2 text-sm leading-6 text-ink">
                  {day.cookToday.run_through}
                </p>
              )}
              {/* ── FF-057 · LA PORTE DE LA PROCÉDURE ACCIDENT ──────────────
                  L'arbre entier existe côté serveur (`accident.ts`) et n'était
                  atteignable QUE par la conversation: `grep -r "KEEL_FIX"
                  frontend/src/` rendait ZÉRO le 2026-08-18. Ce bouton ne fait
                  qu'ouvrir la porte.

                  ⚠️ IL EST SOUS LE DÉROULÉ, PAS À CÔTÉ DU TITRE. La séquence
                  de lecture est « voilà ce que tu cuisines aujourd'hui, voilà
                  l'ordre des gestes » — et seulement après, « et si ça n'a pas
                  eu lieu ». Le poser en tête ferait de l'échec la première
                  chose qu'on lit sur sa propre cuisine.

                  ⛔ UN SEUL BOUTON, ET PAS TROIS. Le serveur POSE LA SUITE:
                  il répond avec l'espace de réalignement calculé sur le plan
                  réel (`buildRealignmentSpace` — décaler, du sans-cuisson,
                  glisser la session, ou ne rien changer) et ses propres
                  boutons, que la conversation rend déjà. Offrir ces choix ici
                  les ferait calculer par l'écran, qui ne sait ni ce qui est
                  périssable, ni ce qui est déjà cuit, ni où finit la fenêtre
                  du plan. */}
              <SessionMissedButton
                mealId={meals.mealId}
                cookOn={todayDate}
              />
            </div>
          )
          : day.cookTomorrow
          ? (
            <p className="text-sm text-ink">
              {mealCopy("meals.today.cook_tomorrow")}
              {day.cookTomorrow.total_minutes !== null && (
                <span className="ml-2 text-xs tabular-nums text-ink-soft">
                  {mealCopy("meals.sessions.session_time").replace(
                    "{n}",
                    String(day.cookTomorrow.total_minutes),
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
        {!day.cookToday && !day.cookTomorrow && sessions.length > 0 && (
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

/**
 * FF-057 — « JE N'AI PAS FAIT CETTE CUISSON ».
 *
 * ── CE QUE CE COMPOSANT FAIT, ET LA LISTE EST COMPLÈTE ────────────────────
 * Il forme une charge, l'envoie par le canal de conversation qui existe, et
 * emmène la personne là où la réponse arrive. Il ne décide de rien.
 *
 * ⛔ IL NE REJOUE PAS L'ARBRE, et c'est la garantie du lot. Ce qui se passe
 * après le tap — la cascade des repas qui tombent, le glissement de la session,
 * les quatre refus (`perishables_at_risk` quand un périssable déjà acheté ne
 * tiendrait pas jusqu'à la nouvelle cuisson, `already_cooked`,
 * `outside_plan_window`, `no_session`), et l'espace de réalignement — est
 * CALCULÉ SUR LE PLAN RÉEL, côté serveur. L'écran ne sait rien de tout ça, et
 * c'est ce qui garantit qu'il ne contredira jamais le serveur.
 *
 * ── POURQUOI ON EMMÈNE VERS LA CONVERSATION ───────────────────────────────
 * Parce que la réponse Y ARRIVE DÉJÀ, avec ses boutons de suite (« oui, décale
 * de deux jours » / « non, je gère »), que `ChatPage` rend depuis
 * `message.buttons`. Afficher la réponse ici demanderait un second rendu de la
 * même chose — et un second rendu divergerait au premier correctif.
 *
 * ⚠️ ON NAVIGUE APRÈS L'ENVOI, JAMAIS AVANT. Naviguer d'abord ferait arriver la
 * personne sur une conversation où son propre geste n'est pas encore écrit: le
 * silence se lirait comme un bouton mort. En cas d'échec on reste, et on le
 * dit — « un refus loin du geste se lit comme un bouton mort » est une
 * cicatrice de ce dépôt, payée trois fois sur `SetupPage`.
 */
function SessionMissedButton(
  { mealId, cookOn }: { mealId: string | null; cookOn: string },
) {
  const navigate = useNavigate();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  // PAS DE CHARGE, PAS DE BOUTON. `mealId` est `string | null` sur un plan
  // rendu, et « un bouton qui ouvre un vide est pire que pas de bouton »
  // (`DishCard`). Le module rend `null` plutôt que de jeter, exprès.
  const payload = sessionMissedPayload(mealId, cookOn);
  if (!payload) return null;

  const label = mealCopy("meals.today.session_missed");

  return (
    <div className="mt-3">
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          const result = await sendChatMessage(crypto.randomUUID(), {
            kind: "button",
            payload,
            label,
          });
          setBusy(false);
          if (!result.ok) {
            setFailed(true);
            return;
          }
          navigate("/app/chat");
        }}
      >
        {busy ? mealCopy("meals.today.session_missed_busy") : label}
      </Button>
      {failed && (
        <p className="mt-2 text-sm text-amber-800">
          {mealCopy("meals.today.session_missed_failed")}
        </p>
      )}
    </div>
  );
}
