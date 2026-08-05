import React from "react";

import { useAuth } from "../../context/AuthContext";
import {
  type GeneratedMealResult,
  generateMeal,
  loadLatestGeneratedMeal,
  MEAL_SLOTS,
  type MealMode,
  type MealScope,
} from "../api/mealGeneration";
import { dishDayLabel, dishSlotLabel, mealCopy } from "../api/mealLabels";
import DishCard from "./DishCard";
import CookingSessions from "./CookingSessions";
import {
  dishDate,
  stretchDates,
  stretchDayOrder,
  stretchStartDate,
} from "../api/mealStretch";
import { browserLocalDate, useMealTicks } from "../lib/useMealTicks";
import { groupByDay, parsePantry } from "../lib/mealBuilderModel";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import { Field, inputClass } from "./ui/Field";

// LE CONSTRUCTEUR DE REPAS — le moteur `generate-meal-v1`, enfin relié.
//
// OÙ IL VIT, ET POURQUOI PAS AILLEURS
// -----------------------------------
// Il est monté sur `/app/plan`, l'écran de la SEMAINE. C'est là que l'élève
// vient chercher ce qu'il va manger. `/app/meals` porte autre chose: les IDÉES
// que le coach a déposées — sa bibliothèque, pas une génération.
//
// CE QU'IL PRODUIT: des plats. Un titre, un jour, un créneau, des ingrédients
// avec leur quantité, la méthode en prose. Plus une liste de courses par rayon.
// Ce n'est pas une liste de principes: c'est le dîner de mardi.
//
// ── LA DOCTRINE NE S'AFFICHE JAMAIS ───────────────────────────────────────
// C'est LA règle de cet écran. Les convictions du coach ENTRENT dans la
// composition — le moteur charge la doctrine publiée avant d'appeler le modèle,
// et `generated_from.belief_keys` en garde la trace en base — et elles n'en
// RESSORTENT pas. `GeneratedDish.honours_belief_keys` existe côté moteur,
// marqué « Informatif — jamais exigé, jamais vérifié »; le client
// (`api/mealGeneration.ts`) ne le recopie même pas, pour qu'aucun rendu ne
// puisse l'afficher par accident.
//
// L'élève voit son dîner. La méthode qui l'a produit est le matériel privé du
// coach, et l'afficher transformerait un repas en leçon.
//
// LE PLAT LUI-MÊME EST RENDU PAR `DishCard`, partagé avec `/app/today`: c'est
// le même plat lu à deux moments (« ce que je viens de composer » ici, « ce que
// je mange aujourd'hui » là-bas), et deux rendus auraient fini par diverger.
//
// ── CE QUI SE COCHE ICI, ET CE QUI NE SE COCHE PAS ─────────────────────────
// Pas de statut, pas de série, pas de progression: il n'y a rien à TERMINER,
// parce que personne n'a rien prescrit. Une seule case existe, sur les plats
// d'AUJOURD'HUI, et elle dit « j'ai mangé ça » — un fait que l'élève rapporte.
// Les plats des autres jours n'en portent pas: une coche est datée du jour où
// on tape, et le raisonnement complet est dans `lib/useMealTicks.ts`.

const COPY = {
  "meals.form.title": "Build me something",
  "meals.form.mode_label": "Where do we start",
  "meals.form.mode_from_pantry": "From what I already have",
  "meals.form.mode_to_shop": "I will shop for it",
  "meals.form.scope_label": "How much",
  "meals.form.scope_day": "One day",
  "meals.form.scope_several": "Several days",
  "meals.form.slot_label": "A particular meal (optional)",
  "meals.form.slot_any": "The whole day",
  "meals.form.servings_label": "How many people",
  "meals.form.pantry_label": "What you have in",
  "meals.form.pantry_hint":
    "One per line. Add an amount if it matters — «rice, 500g».",
  "meals.form.pantry_placeholder": "chicken thighs\nrice\nspinach",
  "meals.form.context_label": "Anything going on this week (optional)",
  "meals.form.context_placeholder":
    "training Tue and Thu, eating out on Friday, short on time…",
  // Le champ est repris de la dernière génération. La légende dit d'où il
  // vient: sans elle, « mariage mardi » — une contrainte qui ne se répète pas —
  // repartirait chaque semaine sans que personne le remarque.
  "meals.form.context_carried":
    "Kept from your last plan. Change it if this week is different.",
  "meals.form.submit": "Build it",
  "meals.form.building": "Building…",
  "meals.form.cancel": "Cancel",
  "meals.form.pantry_required": "Add what you have in, or switch to «I will shop for it».",
  "meals.result.title": "Your meals",
  "meals.result.empty":
    "Nothing built yet. Tell me where to start above and I will put a few meals together.",
  "meals.result.shopping_title": "Shopping list",
  // Deux repères, et rien de plus. « Demain », « dans 3 jours » seraient des
  // calculs à refaire à chaque rendu pour une information que l'ordre donne
  // déjà: ce qui suit « today » est à venir.
  "meals.result.today": "Today",
  "meals.result.past": "Gone by",
  "meals.loading": "Loading…",
  // ── QUAND LA SEMAINE EXISTE DÉJÀ ──────────────────────────────────────────
  "meals.rebuild.button": "Build another plan",
  "meals.rebuild.title": "Build another plan",
  // Le formulaire REMPLACE la semaine en place, et le dit AVANT qu'on clique.
  // C'est le seul geste destructif de l'écran: `generate-meal-v1` écrit une
  // ligne neuve, et cet écran ne lit que la dernière.
  "meals.rebuild.warning":
    "This replaces the week below. What is there now stops being what you open tomorrow.",
  "meals.rebuild.building":
    "Building your new week — it takes a few seconds. The one you had stays in place until this lands.",
} as const;

type CopyKey = keyof typeof COPY;

function c(key: CopyKey): string {
  return COPY[key];
}

type LoadState = "loading" | "ready";

export default function MealBuilder() {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [state, setState] = React.useState<LoadState>("loading");
  const [result, setResult] = React.useState<GeneratedMealResult | null>(null);

  const [mode, setMode] = React.useState<MealMode>("to_shop");
  const [scope, setScope] = React.useState<MealScope>("several_days");
  const [slot, setSlot] = React.useState<string>("");
  const [servings, setServings] = React.useState(1);
  const [pantryText, setPantryText] = React.useState("");
  const [context, setContext] = React.useState("");
  /** Vrai tant que le contexte affiché est celui de la dernière génération. */
  const [contextCarried, setContextCarried] = React.useState(false);
  const [building, setBuilding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /**
   * LE FORMULAIRE EST DEMANDÉ, IL N'EST PLUS POSÉ EN PERMANENCE.
   *
   * Il occupait le haut de l'écran à chaque visite, y compris quand la semaine
   * était déjà faite. L'élève qui vient lire ce qu'il mange mardi tombait
   * d'abord sur huit champs à remplir, et devait défiler pour trouver son
   * dîner. Le formulaire est un geste ponctuel; la semaine est ce qu'on vient
   * voir. Alors: pas de semaine -> le formulaire EST l'écran; une semaine ->
   * un bouton, et le formulaire quand on le demande.
   */
  const [formOpen, setFormOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) return;
      try {
        const latest = await loadLatestGeneratedMeal(userId);
        if (!cancelled) {
          setResult(latest);
          // LE CONTEXTE SE REPROPOSE. « Cantine le midi », « je m'entraîne
          // mardi et jeudi », « le week-end chez mes parents »: ces contraintes
          // sont celles d'une VIE, pas d'une semaine, et les retaper à chaque
          // génération est la friction qui fait qu'on finit par ne plus les
          // dire du tout — après quoi le moteur compose pour quelqu'un d'autre.
          //
          // Il est REPROPOSÉ, pas réappliqué en douce: le texte est dans un
          // champ ouvert, et la légende dit d'où il vient pour que « mariage
          // mardi », qui lui ne se répète pas, saute aux yeux.
          if (latest?.context) {
            setContext(latest.context);
            setContextCarried(true);
          }
        }
      } catch {
        // Une dernière composition illisible ne doit pas empêcher d'en demander
        // une neuve: l'écran s'ouvre vide, le bouton marche.
      }
      if (!cancelled) setState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // LES COCHES. La liaison vit dans `lib/useMealTicks.ts` et pas ici: cet écran
  // et `/app/today` rendent le MÊME plat, et deux liaisons auraient fini par
  // afficher deux vérités.
  const ticks = useMealTicks({
    userId,
    mealId: result?.mealId ?? null,
    dishes: result?.dishes ?? [],
  });

  const pantry = parsePantry(pantryText);

  async function build(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === "from_pantry" && pantry.length === 0) {
      setError(c("meals.form.pantry_required"));
      return;
    }
    // LA FENÊTRE SE REFERME DÈS QUE LA GÉNÉRATION PART. Ce qu'on veut regarder
    // pendant l'attente, c'est la place de la semaine, pas les champs qu'on
    // vient de remplir.
    setFormOpen(false);
    setBuilding(true);
    try {
      setResult(
        await generateMeal({
          mode,
          scope,
          slot: slot ? (slot as (typeof MEAL_SLOTS)[number]) : null,
          servings,
          context: context.trim() || null,
          // CE QUI N'EST PLUS DEMANDÉ N'EST PLUS ENVOYÉ. Le champ est masqué en
          // mode `to_shop`, mais le texte survit à la bascule — et l'envoyer
          // quand même produirait une contradiction à l'écran: le moteur ignore
          // le garde-manger pour composer (« they have not shopped yet — give
          // the full list ») mais calcule quand même `in_pantry` sur ce qu'on
          // lui passe. Un ingrédient serait badgé « You have it » ET listé dans
          // les courses.
          pantry: mode === "from_pantry" ? pantry : [],
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // ÉCHEC: le formulaire REVIENT, avec ce qui a été saisi et le motif. La
      // semaine précédente n'a pas bougé — le moteur écrit une ligne neuve ou
      // n'écrit rien — donc elle se réaffiche telle quelle sous le formulaire.
      // Laisser l'écran fermé sur un message d'erreur obligerait à retaper les
      // huit champs pour réessayer.
      setFormOpen(true);
    } finally {
      setBuilding(false);
    }
  }

  if (state === "loading") {
    return <p className="text-sm text-gray-500">{c("meals.loading")}</p>;
  }

  // LA SEMAINE DE CETTE COMPOSITION, ancrée sur le jour où elle a été faite.
  // Le moteur remplit sept jours à partir de là; c'est ce qui donne une DATE à
  // chaque jeton, et donc l'ordre d'affichage comme la fenêtre de rattrapage.
  const startDate = stretchStartDate(result?.createdAt ?? null);
  const dayDates = stretchDates(startDate);
  // L'ordre du PLAN, pas celui du calendrier: un plan composé mercredi ne
  // s'ouvre pas sur lundi et mardi, qui sont la semaine suivante.
  const groups = groupByDay(result?.dishes ?? [], stretchDayOrder(startDate));
  // Rien à lire encore: le formulaire n'est pas « une option », c'est l'écran.
  const hasWeek = groups.length > 0;
  const showForm = formOpen || !hasWeek;
  // AUJOURD'HUI, dans l'horloge du navigateur — la seule que cet écran ait, et
  // la même que celle qui calcule `week_start`.
  const today = browserLocalDate();

  return (
    <div className="space-y-8">
        {showForm && (
        <section>
          <SectionLabel>
            {hasWeek ? c("meals.rebuild.title") : c("meals.form.title")}
          </SectionLabel>
          <Card>
            {/* CE QUE ÇA COÛTE, DIT AVANT LE CLIC. Une génération remplace la
                semaine affichée: cet écran ne lit que la dernière ligne. Le
                découvrir après coup serait perdre un plan qu'on avait accepté. */}
            {hasWeek && (
              <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                {c("meals.rebuild.warning")}
              </p>
            )}
            <form className="space-y-4" onSubmit={(e) => void build(e)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={c("meals.form.mode_label")} htmlFor="meals-mode">
                  <select
                    id="meals-mode"
                    className={inputClass}
                    value={mode}
                    onChange={(e) => setMode(e.target.value as MealMode)}
                  >
                    <option value="to_shop">{c("meals.form.mode_to_shop")}</option>
                    <option value="from_pantry">{c("meals.form.mode_from_pantry")}</option>
                  </select>
                </Field>
                <Field label={c("meals.form.scope_label")} htmlFor="meals-scope">
                  <select
                    id="meals-scope"
                    className={inputClass}
                    value={scope}
                    onChange={(e) => setScope(e.target.value as MealScope)}
                  >
                    <option value="several_days">{c("meals.form.scope_several")}</option>
                    <option value="day">{c("meals.form.scope_day")}</option>
                  </select>
                </Field>
                <Field label={c("meals.form.slot_label")} htmlFor="meals-slot">
                  <select
                    id="meals-slot"
                    className={inputClass}
                    value={slot}
                    onChange={(e) => setSlot(e.target.value)}
                  >
                    <option value="">{c("meals.form.slot_any")}</option>
                    {MEAL_SLOTS.map((s) => (
                      <option key={s} value={s}>{dishSlotLabel(s)}</option>
                    ))}
                  </select>
                </Field>
                <Field label={c("meals.form.servings_label")} htmlFor="meals-servings">
                  <input
                    id="meals-servings"
                    type="number"
                    min={1}
                    max={12}
                    className={inputClass}
                    value={servings}
                    onChange={(e) => setServings(Number(e.target.value) || 1)}
                  />
                </Field>
              </div>

              {/* LE GARDE-MANGER N'EXISTE QUE DANS LE MODE QUI LE LIT.
                  « I will shop for it » dit au moteur, mot pour mot, « they have
                  not shopped yet — give the full list »: la liste ne lui est
                  jamais montrée. Demander quand même ce qu'on a chez soi, c'est
                  faire remplir un champ dont on sait qu'il ne servira pas.
                  Le texte saisi n'est pas jeté: on rebascule et il est là. */}
              {mode === "from_pantry" && (
                <Field
                  label={c("meals.form.pantry_label")}
                  hint={c("meals.form.pantry_hint")}
                  htmlFor="meals-pantry"
                >
                  <textarea
                    id="meals-pantry"
                    className={`${inputClass} min-h-24`}
                    value={pantryText}
                    placeholder={c("meals.form.pantry_placeholder")}
                    onChange={(e) => setPantryText(e.target.value)}
                  />
                </Field>
              )}

              <Field
                label={c("meals.form.context_label")}
                hint={contextCarried ? c("meals.form.context_carried") : undefined}
                htmlFor="meals-context"
              >
                <textarea
                  id="meals-context"
                  className={`${inputClass} min-h-16`}
                  value={context}
                  placeholder={c("meals.form.context_placeholder")}
                  onChange={(e) => {
                    setContext(e.target.value);
                    // Dès qu'on y touche, ce n'est plus « repris de la dernière
                    // fois »: la légende doit cesser de le prétendre.
                    setContextCarried(false);
                  }}
                />
              </Field>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="primary" disabled={building}>
                  {building ? c("meals.form.building") : c("meals.form.submit")}
                </Button>
                {/* On ne peut renoncer que s'il y a quelque chose à retrouver
                    derrière. Sans semaine, « Cancel » ne mènerait qu'à un écran
                    vide sans issue. */}
                {hasWeek && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={building}
                    onClick={() => {
                      setError(null);
                      setFormOpen(false);
                    }}
                  >
                    {c("meals.form.cancel")}
                  </Button>
                )}
              </div>
            </form>
          </Card>
        </section>
        )}

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionLabel className="mb-0">{c("meals.result.title")}</SectionLabel>
            {/* LE GESTE, RÉDUIT À UN BOUTON. Il ne s'affiche pas quand le
                formulaire est déjà ouvert (il ouvrirait ce qui est ouvert) ni
                quand il n'y a pas de semaine (il n'y a pas d'« autre »). */}
            {hasWeek && !showForm && (
              <Button
                variant="secondary"
                size="sm"
                disabled={building}
                onClick={() => setFormOpen(true)}
              >
                {building ? c("meals.form.building") : c("meals.rebuild.button")}
              </Button>
            )}
          </div>
          {/* UNE COCHE QUI N'A PAS PRIS SE DIT. Sans ça, la case revient à sa
              place sans un mot et l'élève croit avoir mal visé — puis retape,
              indéfiniment, sur une écriture que la base refuse. */}
          {ticks.error && (
            <p className="mb-3 text-sm text-red-600">
              {mealCopy("meals.tick.failed")}
            </p>
          )}
          {building
            ? (
              <Card tone="dashed">
                <p className="text-sm text-gray-500">{c("meals.rebuild.building")}</p>
              </Card>
            )
            : groups.length === 0
            ? (
              <Card tone="dashed">
                <p className="text-sm text-gray-500">{c("meals.result.empty")}</p>
              </Card>
            )
            : (
              <div className="space-y-6">
                {groups.map((group) => {
                  // LA DATE DE CE GROUPE. C'est le groupe qui porte le jour où
                  // le plat se MANGE — un plat en lot est déjà placé sur chacun
                  // des siens — donc c'est lui qui tranche, jamais `dish.day`
                  // qui ne nomme que la cuisson.
                  const date = dishDate(group.day, dayDates, today);
                  return (
                  <div key={group.day ?? "undated"}>
                    {group.day && (
                      <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-gray-900">
                        {dishDayLabel(group.day)}
                        {/* OÙ ON EN EST DANS LE PLAN. Sans repère, une semaine
                            qui commence mercredi se lit comme une semaine en
                            retard: on ne sait pas si le premier jour affiché
                            est passé, courant ou à venir. */}
                        {date === today && (
                          <span className="text-[11px] font-normal uppercase tracking-wide text-emerald-700">
                            {c("meals.result.today")}
                          </span>
                        )}
                        {date !== null && date < today && (
                          <span className="text-[11px] font-normal uppercase tracking-wide text-gray-400">
                            {c("meals.result.past")}
                          </span>
                        )}
                      </h3>
                    )}
                    <div className="space-y-3">
                      {group.dishes.map((dish, index) => (
                        <DishCard
                          key={`${group.day}-${index}-${dish.title}`}
                          dish={dish}
                          // LE JOUR DE CUISSON DÉCIDE DE CE QU'ON AFFICHE.
                          // `cook_on` prime sur `dish.day`: le modèle nomme
                          // parfois le jour du premier repas et parfois celui
                          // de la casserole, et seule la première valeur est
                          // explicite sur ce point.
                          // LES PRÉPARATIONS QUE CE PLAT CONSOMME, résolues
                          // ici: le plat ne porte que des `id`, et une carte
                          // qui irait les chercher elle-même dupliquerait la
                          // résolution sur les deux écrans qui la montent.
                          sources={dish.uses
                            .map((u) =>
                              (result?.preparations ?? []).find((p) =>
                                p.id === u.preparation_id
                              )
                            )
                            .filter((p): p is NonNullable<typeof p> => Boolean(p))
                            .map((p) => ({ title: p.title, cookOn: p.cook_on }))}
                          // Le passé et aujourd'hui se cochent, avec la date du
                          // jour où le plat se mangeait; les plats à venir n'ont
                          // pas de case. La règle est tenue par `bind`, pas ici:
                          // deux écrans montrent ces plats.
                          tick={ticks.bind(dish, date)}
                        />
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
        </section>

        {/* LES SESSIONS AVANT LES JOURS. On lit ce qu'on cuisine avant de lire
            ce qu'on mange: c'est l'ordre dans lequel la semaine se prépare, et
            c'est ce que l'élève ouvre le dimanche soir. Elle disparaît pendant
            une génération, comme la liste de courses: elle décrit des
            préparations qu'on est en train de remplacer. */}
        {!building && (
          <CookingSessions
            sessions={result?.cookingSessions ?? []}
            preparations={result?.preparations ?? []}
          />
        )}

        {/* La liste de courses de la semaine SORTANTE disparaît pendant la
            génération: elle décrit des plats qu'on est en train de remplacer,
            et faire ses courses dessus serait acheter pour un plan mort. */}
        {!building && (result?.shoppingList.length ?? 0) > 0 && (
          <section>
            <SectionLabel>{c("meals.result.shopping_title")}</SectionLabel>
            <Card>
              <ul className="space-y-1">
                {result!.shoppingList.map((item, index) => (
                  <li
                    key={`${item.term}-${index}`}
                    className="flex flex-wrap items-baseline gap-2 text-sm text-gray-800"
                  >
                    <span>{item.term}</span>
                    {item.quantity && (
                      <span className="text-gray-500">{item.quantity}</span>
                    )}
                    <Badge tone="neutral">{item.aisle}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}

    </div>
  );
}
