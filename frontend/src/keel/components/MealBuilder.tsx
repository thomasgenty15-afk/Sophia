import React from "react";

import { useAuth } from "../../context/AuthContext";
import {
  type AwayDay,
  type EatingOccasionSlot,
  type GeneratedMealResult,
  generateMeal,
  loadMealPlans,
  MEAL_SLOTS,
  type MealMode,
} from "../api/mealGeneration";
import {
  lastNameableStart,
  MAX_WINDOW_DAYS,
  type MealWindowRequest,
  planEndsOn,
  resolveRequestedWindow,
  windowDayOrder,
} from "../api/mealWindow";
import { mealCopy } from "../api/mealLabels";
import { loadMyHouseholdPlace } from "../api/household";
import { edgeRefusalKey } from "../copy/planRefusals";
import { t } from "../i18n/t";
import TakeTheHandCard, { type HouseholdPlace } from "./TakeTheHandCard";
import PlanResult from "./plan/PlanResult";
import ShoppingListPanel from "./ShoppingListPanel";
import CookingSessions from "./CookingSessions";
import MealPickerGrid from "./MealPickerGrid";
import { } from "../api/mealStretch";
import { addDays, daysBetween } from "../api/dates";
import { browserLocalDate, useMealTicks } from "../lib/useMealTicks";
import { useMealEnergy } from "../lib/useMealEnergy";
import { groupByDay, parsePantry } from "../lib/mealBuilderModel";
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
  // LA FENÊTRE, ET CE QU'ELLE COUVRE VRAIMENT. « Until Sunday » un dimanche
  // fait UN jour — l'aperçu le dit, sinon le bouton a l'air cassé.
  "meals.form.window_label": "Which days",
  // ── DEUX DATES, ET PLUS TROIS BOUTONS ──────────────────────────────────
  // « Until Sunday » un dimanche faisait UN jour, « For 7 days » ne disait pas
  // lesquels, et le nombre de jours obligeait à compter dans sa tête pour
  // savoir où on atterrit. Les trois libellés restent ici tant que rien ne les
  // affiche plus: les retirer dans le même geste que la refonte de l'écran
  // ferait deux changements dans un seul diff, et c'est celui qu'on ne relit
  // pas qui casse.
  "meals.form.window_from": "From",
  "meals.form.window_to": "To",
  "meals.form.window_until_sunday": "Until Sunday",
  "meals.form.window_seven_days": "For 7 days",
  "meals.form.window_exact": "Choose exactly",
  "meals.form.window_days_label": "How many days",
  "meals.form.window_one_day": "Just today.",
  "meals.form.slot_label": "A particular meal (optional)",
  "meals.form.slot_any": "The whole day",
  "meals.form.servings_label": "How many people",
  "meals.form.pantry_label": "What you have in",
  "meals.form.pantry_hint":
    "One per line. Add an amount if it matters — «rice, 500g».",
  "meals.form.pantry_placeholder": "chicken thighs\nrice\nspinach",
  // L'ENVIE, ET PAS LES GOÛTS. Ce champ est DATÉ — il vaut pour cette
  // composition. Les goûts durables (« je déteste le brocoli ») vivent dans
  // « What you have told me about your eating », viennent de la conversation, et
  // valent pour toutes les semaines. Deux champs parce que deux durées de vie:
  // écrire « mezze d'été » dans la liste durable le ferait revenir en février.
  "meals.form.preferences_label": "What you fancy this time (optional)",
  "meals.form.preferences_placeholder":
    "summer mezze — lots of carrots, raw veg, nothing heavy",
  "meals.form.preferences_hint":
    "A mood for these meals. What you always like or never eat belongs in «What you have told me about your eating» — it is remembered on its own.",
  "meals.form.preferences_carried":
    "Kept from your last plan. Change it if you fancy something else.",
  // ── CE CHAMP N'EST PLUS CELUI QU'IL ÉTAIT ─────────────────────────────
  // Il servait à tout dire, y compris « je mange dehors vendredi » — ce que la
  // grille « Which meals, which days » exprime maintenant au jour et au repas
  // près. Ce qui reste ici est ce que la grille NE PEUT PAS dire: l'ÉVÉNEMENT.
  // Des invités, un four en panne, un retour de vacances. Le placeholder le
  // montre plutôt que de le décrire — trois exemples se lisent, une consigne
  // de remplissage se saute.
  "meals.form.context_label": "Anything going on this week (optional)",
  "meals.form.context_placeholder":
    "guests on Saturday · the oven is broken · back from holiday, empty fridge",
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
  "meals.result.shopping_close": "Hide shopping list",
  // Deux repères, et rien de plus. « Demain », « dans 3 jours » seraient des
  // calculs à refaire à chaque rendu pour une information que l'ordre donne
  // déjà: ce qui suit « today » est à venir.
  "meals.result.today": "Today",
  "meals.result.past": "Gone by",
  "meals.loading": "Loading…",
  // ── QUAND LA SEMAINE EXISTE DÉJÀ ──────────────────────────────────────────
  "meals.rebuild.button": "Build another plan",
  "meals.rebuild.title": "Build another plan",
  "meals.rebuild.prepare_next": "Prepare next plan",
  "meals.result.tab_current": "This week",
  "meals.result.tab_next": "Next",
  // L'AVERTISSEMENT DE TRONCATURE. Il NOMME les jours qui partent, parce que
  // les courses de ces jours-là ont peut-être déjà été faites — et cette
  // dépense-là ne se rembourse pas.
  "meals.rebuild.truncates":
    "This takes {days} day(s) off your current plan ({from} → {to}). You may already have shopped for them.",
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

export interface MealBuilderProps {
  /**
   * LE RYTHME ET LES ABSENCES VIENNENT DE LA PAGE, qui lit déjà
   * `student_goals`. Les relire ici ferait un SECOND lecteur de la même
   * colonne, et la grille pourrait montrer autre chose que ce que le
   * générateur reçoit — le défaut exact que ce dépôt a payé sur le rythme.
   */
  rhythm?: readonly EatingOccasionSlot[];
  awayDays?: readonly AwayDay[];
  /** Reçoit la liste complète à écrire dans `practical_constraints`. */
  onAwaySaved?: (next: AwayDay[]) => Promise<void>;
}

export default function MealBuilder(props: MealBuilderProps = {}) {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [state, setState] = React.useState<LoadState>("loading");
  /**
   * LES DEUX PLANS, et l'onglet qu'on regarde.
   *
   * Un élève peut avoir un plan EN COURS et un plan PRÉPARÉ pour plus tard.
   * « Le suivant devient le courant » n'est pas un événement: `loadMealPlans`
   * les reclasse à chaque lecture selon la date du jour, sans que rien n'ait
   * été écrit.
   */
  const [plans, setPlans] = React.useState<{
    current: GeneratedMealResult | null;
    next: GeneratedMealResult | null;
  }>({ current: null, next: null });
  const [tab, setTab] = React.useState<"current" | "next">("current");
  /**
   * L8/O2 — MA PLACE DANS UN FOYER, ou `null` tant qu'on ne l'a pas lue.
   *
   * Elle décide de ce que la carte de prise de main raconte, et les trois cas
   * disent des choses OPPOSÉES: un compte individuel n'a rien à prendre, un
   * secondaire peut prendre la main, un maître cuisine déjà le plan du foyer.
   * D'où `null` explicite plutôt qu'un défaut: monter la carte sur une valeur
   * non lue afficherait à quelqu'un une phrase qui ne le concerne pas — et un
   * formulaire monté sur du vide est une cicatrice mesurée de ce dépôt.
   */
  const [place, setPlace] = React.useState<HouseholdPlace | null>(null);

  const [mode, setMode] = React.useState<MealMode>("to_shop");
  /**
   * CE QU'ON DEMANDE, pas ce qu'on impose. `scope` était une entrée du client,
   * et une ligne « un jour » portant une fenêtre de sept jours était donc
   * possible; il est maintenant DÉRIVÉ de la durée, côté serveur.
   *
   * Deux préréglages bien visibles, et le reste derrière un lien discret: le
   * geste courant est « jusqu'à dimanche » ou « sept jours », et un sélecteur
   * de dates posé en permanence ferait payer à tout le monde le cas rare.
   */
  // ── LA FENÊTRE, EN DEUX DATES ─────────────────────────────────────────
  // L'état porte les deux BORNES, pas une intention. `MealWindowRequest` garde
  // ses trois formes (le serveur et les tests s'en servent), et l'écran
  // n'utilise plus que `exact`: le reste était trois façons de dire la même
  // chose, dont deux qui ne montraient pas où on atterrit.
  const [windowStart, setWindowStart] = React.useState(() => browserLocalDate());
  const [windowEnd, setWindowEnd] = React.useState(() =>
    addDays(browserLocalDate(), 6)
  );

  // Le début pousse la fin devant lui, et la borne de sept jours la retient.
  // Sans ça on obtient une fin AVANT le début, que `resolveRequestedWindow`
  // refuse — un refus qu'on peut éviter en le rendant impossible à composer.
  React.useEffect(() => {
    const maxEnd = addDays(windowStart, MAX_WINDOW_DAYS - 1);
    if (windowEnd < windowStart) setWindowEnd(windowStart);
    else if (windowEnd > maxEnd) setWindowEnd(maxEnd);
  }, [windowStart, windowEnd]);

  /**
   * LES JOURS DE LA FENÊTRE DEMANDÉE — ceux que la grille montre.
   *
   * Calculés sur la fenêtre DEMANDÉE (les deux dates), pas sur celle du plan
   * déjà généré: la grille sert à préparer la PROCHAINE composition.
   */
  const askedDays = React.useMemo(() => {
    const n = Math.min(
      MAX_WINDOW_DAYS,
      Math.max(1, daysBetween(windowStart, windowEnd) + 1),
    );
    return {
      tokens: windowDayOrder(windowStart, n),
      dates: Array.from({ length: n }, (_, i) => addDays(windowStart, i)),
    };
  }, [windowStart, windowEnd]);

  /** Combien de moments sont écartés DANS cette fenêtre — pour le bouton. */
  const awayInWindow = React.useMemo(() => {
    const inWindow = new Set<string>(askedDays.tokens);
    const slots = (props.rhythm ?? []).length;
    return (props.awayDays ?? [])
      .filter((a) => inWindow.has(a.day))
      .reduce((n, a) => n + (a.slots.length === 0 ? slots : a.slots.length), 0);
  }, [askedDays, props.awayDays, props.rhythm]);

  const windowRequest = React.useMemo<MealWindowRequest>(() => ({
    kind: "exact",
    startsOn: windowStart,
    durationDays: Math.min(
      MAX_WINDOW_DAYS,
      Math.max(1, daysBetween(windowStart, windowEnd) + 1),
    ),
  }), [windowStart, windowEnd]);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerBusy, setPickerBusy] = React.useState(false);
  // ── DEUX CHAMPS RETIRÉS DE L'ÉCRAN, DEUX COLONNES GARDÉES ──────────────
  // `slot` (« A particular meal ») demandait UN créneau pour toute la fenêtre.
  // La grille « Which meals, which days » dit la même chose au jour près, donc
  // le menu déroulant ne pouvait plus qu'entrer en conflit avec elle.
  //
  // `context` (« Anything going on this week ») est parti sur décision produit
  // du 2026-08-08. Ce N'EST PAS un doublon de la grille: la grille dit « je ne
  // mange pas ici », elle ne dit ni « des invités samedi », ni « le four est en
  // panne », ni « je rentre de vacances ». Avec `situation` déjà retiré, il ne
  // reste plus AUCUN champ de contrainte en prose — seulement l'envie du
  // moment. C'est noté en question ouverte dans FF-003, qui proposait de LIRE
  // cette prose plutôt que de la supprimer.
  //
  // Les deux valeurs partent donc à `null` dans la requête, et les colonnes
  // `meal_slot` / `context` restent: des lignes déjà écrites les portent, et
  // `buildMealPrompt` sait toujours les lire.
  const slot = "";
  const [context, setContext] = React.useState("");
  /** Vrai tant que le contexte affiché est celui de la dernière génération. */
  const [contextCarried, setContextCarried] = React.useState(false);
  const [servings, setServings] = React.useState(1);
  const [pantryText, setPantryText] = React.useState("");
  /** L'envie du moment, reproposée d'une génération à l'autre. */
  const [preferences, setPreferences] = React.useState("");
  const [preferencesCarried, setPreferencesCarried] = React.useState(false);
  const [building, setBuilding] = React.useState(false);
  /** La liste de courses est dépliée ou non. Son bouton vit dans l'en-tête. */
  const [shoppingOpen, setShoppingOpen] = React.useState(false);
  /** Les sessions de cuisine, même traitement et même rang de bouton. */
  const [sessionsOpen, setSessionsOpen] = React.useState(false);
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
  /**
   * QUEL GESTE A OUVERT LE FORMULAIRE — et pas « y a-t-il un plan dans cet
   * onglet ».
   *
   * DÉFAUT MESURÉ le 2026-08-07: l'intention se DÉDUISAIT de l'occupation de
   * l'onglet (`plans.current ? replace : prepare`). « Prepare next plan »
   * ouvrait donc le formulaire sur l'onglet courant, et la déduction rendait
   * `replace_current` — le plan en cours a été RETIRÉ au lieu d'être raccourci.
   * L'élève voulait préparer la suite; il a perdu la semaine pour laquelle il
   * avait fait ses courses.
   *
   * Une intention est ce qu'on a DEMANDÉ. Elle se stocke, elle ne se devine pas.
   */
  const [formIntent, setFormIntent] = React.useState<
    "replace_current" | "prepare_next"
  >("replace_current");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) return;
      // L8/O2 — LA PLACE, LUE À PART ET SANS BLOQUER LES PLATS. Un foyer
      // illisible ne doit pas faire disparaître la semaine: la carte de prise
      // de main se tait (`place` reste `null`), le plan s'affiche quand même.
      try {
        const mine = await loadMyHouseholdPlace(userId);
        if (!cancelled) setPlace(mine);
      } catch {
        if (!cancelled) setPlace(null);
      }
      try {
        const loaded = await loadMealPlans(userId, browserLocalDate());
        if (!cancelled) {
          setPlans({ current: loaded.current, next: loaded.next });
          // On ouvre sur le plan qu'on VIT. Ouvrir sur le suivant ferait lire
          // les repas de la semaine prochaine à quelqu'un qui vient voir ce
          // qu'il mange ce soir.
          setTab(loaded.current ? "current" : loaded.next ? "next" : "current");
          const latest = loaded.current ?? loaded.next;
          // LE CONTEXTE SE REPROPOSE. « Cantine le midi », « je m'entraîne
          // mardi et jeudi », « le week-end chez mes parents »: ces contraintes
          // sont celles d'une VIE, pas d'une semaine, et les retaper à chaque
          // génération est la friction qui fait qu'on finit par ne plus les
          // dire du tout — après quoi le moteur compose pour quelqu'un d'autre.
          //
          // Il est REPROPOSÉ, pas réappliqué en douce: le texte est dans un
          // champ ouvert, et la légende dit d'où il vient pour que « mariage
          // mardi », qui lui ne se répète pas, saute aux yeux.
          // REPROPOSÉ, pas réappliqué en douce: le texte est dans un champ
          // ouvert, et la légende dit d'où il vient pour que « mariage mardi »,
          // qui lui ne se répète pas, saute aux yeux.
          if (latest?.context) {
            setContext(latest.context);
            setContextCarried(true);
          }
          // MÊME REPRISE POUR L'ENVIE: « mezze d'été » vaut souvent encore la
          // semaine suivante, et la légende dit d'où le texte vient pour qu'une
          // envie périmée saute aux yeux plutôt que de repartir en silence.
          if (latest?.preferences) {
            setPreferences(latest.preferences);
            setPreferencesCarried(true);
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
  // LE PLAN AFFICHÉ est celui de l'onglet: tout ce qui suit (plats, courses,
  // sessions, coches, geste de régénération) porte sur LUI et pas sur « le
  // dernier écrit ».
  const result = tab === "next" ? plans.next : plans.current;

  /**
   * CE QUE LES BOUTONS COUVRENT, en clair, avant de cliquer.
   *
   * L'aperçu est INDICATIF: la fenêtre qui fait foi est résolue par le serveur
   * avec le fuseau de l'élève. Les deux doivent s'accorder au jour près, d'où
   * le module miroir et sa table de cas partagée.
   *
   * Une intention impossible (durée hors bornes, départ dans le passé) ne casse
   * pas l'écran: elle rend son motif, et le serveur refusera de toute façon.
   */
  const windowPreview = React.useMemo(() => {
    try {
      const today = browserLocalDate();
      const w = resolveRequestedWindow(windowRequest, today);
      const ends = planEndsOn(w.startsOn, w.durationDays);
      if (w.durationDays === 1) return c("meals.form.window_one_day");
      return `${w.startsOn} → ${ends} · ${w.durationDays} days`;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [windowRequest]);

  /**
   * Le lendemain de la fin du plan courant — le départ qui ne tronque RIEN.
   *
   * C'est le défaut de « Prepare next plan », parce que c'est le seul choix qui
   * ne coûte rien à personne. L'élève peut le ramener plus tôt; l'écran lui dira
   * alors ce que ça retire.
   */
  const nextDefaultStart = React.useMemo(() => {
    const today = browserLocalDate();
    if (!plans.current?.startsOn) return today;
    const after = addDays(
      planEndsOn(plans.current.startsOn, plans.current.durationDays),
      1,
    );
    return after > today ? after : today;
  }, [plans.current]);

  /**
   * CE QUE LA FENÊTRE DEMANDÉE RETIRERAIT AU PLAN COURANT.
   *
   * Dit AVANT le clic, et il nomme les jours: ce sont peut-être des jours pour
   * lesquels l'élève a déjà fait ses courses, et cette dépense-là ne se
   * rembourse pas. `null` quand rien ne bouge.
   */
  const truncationWarning = React.useMemo(() => {
    const current = plans.current;
    if (!current?.startsOn) return null;
    let asked: { startsOn: string; durationDays: number };
    try {
      asked = resolveRequestedWindow(windowRequest, browserLocalDate());
    } catch {
      return null;
    }
    const currentEnds = planEndsOn(current.startsOn, current.durationDays);
    // Le nouveau plan ne mord que s'il démarre APRÈS le début du courant et
    // AVANT sa fin: sinon il le remplace (même départ) ou ne le touche pas.
    if (asked.startsOn <= current.startsOn || asked.startsOn > currentEnds) return null;
    const kept = Math.max(
      0,
      Math.round(
        (Date.parse(`${asked.startsOn}T12:00:00Z`) -
          Date.parse(`${current.startsOn}T12:00:00Z`)) / 86_400_000,
      ),
    );
    const lost = current.durationDays - kept;
    if (lost <= 0) return null;
    return c("meals.rebuild.truncates")
      .replace("{days}", String(lost))
      .replace("{from}", String(current.durationDays))
      .replace("{to}", String(kept));
  }, [plans.current, windowRequest]);
  const ticks = useMealTicks({
    userId,
    mealId: result?.mealId ?? null,
    dishes: result?.dishes ?? [],
  });
  // FF-059 — LE CHIFFRE. Même partage que les coches: la liaison vit dans
  // `lib/useMealEnergy.ts`, parce que `/app/today` rend les mêmes plats et doit
  // en rendre le même chiffre. La CHAÎNE DE GARDES, elle, n'est pas ici du tout
  // — elle est dans `meal-energy-v1`, et quand elle ferme, ce hook ne reçoit
  // aucun nombre.
  const energy = useMealEnergy({
    planId: result?.mealId ?? null,
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
      // LE GESTE PORTE SUR LE PLAN QU'ON REGARDE, et sur aucun autre. C'est le
      // point le plus dangereux de cet écran: un élève posé sur « Next » qui
      // appuie sur « Build another plan » détruirait le plan pour lequel il a
      // DÉJÀ FAIT LES COURSES.
      const target = tab === "next" ? plans.next : plans.current;
      // Remplacer exige une cible. Sans plan dans l'onglet, il n'y a rien à
      // remplacer et le premier plan se PRÉPARE.
      const intent = formIntent === "replace_current" && target
        ? "replace_current"
        : "prepare_next";
      const written = await generateMeal({
        mode,
        window: windowRequest,
        intent,
        replaces: intent === "replace_current" ? target?.mealId ?? null : null,
        slot: slot ? (slot as (typeof MEAL_SLOTS)[number]) : null,
        servings,
        context: context.trim() || null,
        preferences: preferences.trim() || null,
        // CE QUI N'EST PLUS DEMANDÉ N'EST PLUS ENVOYÉ. Le champ est masqué en
        // mode `to_shop`, mais le texte survit à la bascule — et l'envoyer
        // quand même produirait une contradiction à l'écran: le moteur ignore
        // le garde-manger pour composer (« they have not shopped yet — give
        // the full list ») mais calcule quand même `in_pantry` sur ce qu'on
        // lui passe. Un ingrédient serait badgé « You have it » ET listé dans
        // les courses.
        pantry: mode === "from_pantry" ? pantry : [],
      });
      // On RELIT plutôt que de poser la réponse à la place du plan affiché: une
      // génération peut avoir TRONQUÉ l'autre plan, et seule une relecture rend
      // les deux fenêtres telles qu'elles sont maintenant en base.
      const loaded = await loadMealPlans(userId, browserLocalDate());
      setPlans({ current: loaded.current, next: loaded.next });
      setTab(
        written.mealId && loaded.next?.mealId === written.mealId ? "next" : "current",
      );
    } catch (e) {
      // LE MOTIF NOMMÉ, TRADUIT (L8). `generateMeal` remonte « jeton: détail »,
      // et l'élève lisait le jeton brut — `household_frozen` pour un secondaire
      // de foyer impayé, écrit noir sur blanc comme une dette de L1. La table
      // est fermée et partagée avec l'écran du foyer; un jeton inconnu ressort
      // tel quel, jamais sous une phrase passe-partout.
      const raw = e instanceof Error ? e.message : String(e);
      const key = edgeRefusalKey(raw.split(":")[0]);
      setError(key ? t(key) : raw);
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

  // LA FENÊTRE VIENT DE LA LIGNE, plus de `created_at`. Elle était DÉDUITE, et
  // la déduction devenait fausse dès qu'un plan pouvait commencer plus tard.
  //
  // `windowDates` rend MOINS de sept entrées sur une fenêtre plus courte: un
  // jeton hors fenêtre n'a pas de date, donc le plat n'est ni rendu, ni
  // cochable. C'est ainsi qu'un plan tronqué cesse de montrer les jours qu'il
  // ne possède plus, sans qu'on ait touché à ses données.
  const startDate = result?.startsOn || browserLocalDate();
  const durationDays = result?.durationDays ?? 7;
  // L'ordre du PLAN, pas celui du calendrier.
  const groups = groupByDay(
    result?.dishes ?? [],
    windowDayOrder(startDate, durationDays),
  );
  // Rien à lire encore: le formulaire n'est pas « une option », c'est l'écran.
  const hasWeek = groups.length > 0;
  /**
   * ── D2/D9 · LE MAÎTRE D'UN FOYER NE COMPOSE PAS ICI ─────────────────────
   *
   * « Le plan du maître EST le plan du foyer », et il se compose depuis
   * `/app/household`. Ce constructeur-ci appelle `generate-meal-v1`, qui écrit
   * un plan PERSONNEL — que sa propre surface de cuisine masque ensuite (voir
   * `cookedPlans`, D9). Le laisser cliquer ici produirait le pire des
   * enchaînements: trente secondes d'attente, un appel modèle payé, un
   * `replaces` qui ne retire rien (l'écriture est scopée par nature), et RIEN
   * à l'écran. Un geste qui ne fait rien est indiscernable d'un geste qui a
   * marché — le mode d'échec n°1 de ce dépôt.
   *
   * ⚠️ `place === null` NE FERME RIEN. La lecture peut être en cours (ou avoir
   * échoué, auquel cas elle rend « pas de foyer »): le compte individuel, qui
   * est le chemin majoritaire, garde son constructeur dans tous les cas.
   * Retour arrière: retirer cette constante et ses deux usages.
   */
  const householdOwner = place?.inHousehold === true && place.isOwner;
  const showForm = !householdOwner && (formOpen || !hasWeek);
  // AUJOURD'HUI, dans l'horloge du navigateur — la seule que cet écran ait, et
  // la même que celle qui calcule `week_start`.
  const today = browserLocalDate();

  return (
    <div className="space-y-8">
        {showForm && (
        <section>
          <SectionLabel>
            {!hasWeek
              ? c("meals.form.title")
              : formIntent === "prepare_next"
              ? c("meals.rebuild.prepare_next")
              : c("meals.rebuild.title")}
          </SectionLabel>
          <Card>
            {/* CE QUE ÇA COÛTE, DIT AVANT LE CLIC. Une génération remplace la
                semaine affichée: cet écran ne lit que la dernière ligne. Le
                découvrir après coup serait perdre un plan qu'on avait accepté. */}
            {hasWeek && formIntent === "replace_current" && !truncationWarning && (
              <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                {c("meals.rebuild.warning")}
              </p>
            )}
            {/* CE QUE ÇA RETIRE AU PLAN COURANT, dit avant le clic et chiffré.
                Il REMPLACE l'avertissement générique: deux bandeaux ambre
                empilés se lisent comme du bruit, et c'est celui-ci qui porte
                l'information coûteuse. */}
            {truncationWarning && (
              <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                {truncationWarning}
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
                {/* ── LA FENÊTRE: UNE DATE DE DÉBUT, UNE DATE DE FIN ──────
                    Trois boutons (« Until Sunday », « For 7 days », « Choose
                    exactly ») plus un champ date plus un champ nombre, pour
                    dire une chose que deux dates disent seules. Et les trois
                    boutons mentaient à moitié: « Until Sunday » un dimanche
                    fait un jour, « For 7 days » ne dit pas lesquels, et le
                    nombre de jours obligeait à compter dans sa tête pour
                    savoir où on atterrit.

                    LA BORNE DE SEPT JOURS EST CELLE DE LA BASE, pas une
                    préférence d'écran: `duration_days between 1 and 7`, et
                    `MAX_WINDOW_DAYS` côté code. Le champ l'applique avec `max`
                    plutôt que de laisser choisir trois semaines et récolter un
                    refus au moment de générer. */}
                <Field label={c("meals.form.window_label")} htmlFor="meals-window">
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label
                        htmlFor="meals-window"
                        className="block text-xs text-gray-500"
                      >
                        {c("meals.form.window_from")}
                      </label>
                      <input
                        id="meals-window"
                        type="date"
                        // Pas de départ dans le PASSÉ: `isReportable`
                        // autoriserait sinon des coches rétroactives sur des
                        // jours qu'un plan précédent possédait.
                        min={browserLocalDate()}
                        // ── C2 ② · NI AU-DELÀ DE DIMANCHE ────────────────
                        // Un plan est écrit en NOMS DE JOURS, et sept jetons
                        // ne nomment pas plus loin. Mesuré le 2026-08-12: ce
                        // champ n'avait aucun `max`, un départ dans quinze
                        // jours partait au modèle, et le message portait
                        // « today is: wed » à côté de « days to fill: tue » —
                        // refus du modèle après 6,2 s FACTURÉES.
                        //
                        // Le serveur reste l'autorité (`window_beyond_this_week`,
                        // en millisecondes, avec le VRAI fuseau de l'élève).
                        // Ce `max` évite seulement de proposer le geste, comme
                        // le `max` du champ de fin évite de proposer huit jours.
                        max={lastNameableStart(browserLocalDate())}
                        value={windowStart}
                        onChange={(e) => setWindowStart(e.target.value)}
                        className={`${inputClass} mt-1 w-auto`}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="meals-window-end"
                        className="block text-xs text-gray-500"
                      >
                        {c("meals.form.window_to")}
                      </label>
                      <input
                        id="meals-window-end"
                        type="date"
                        min={windowStart}
                        max={addDays(windowStart, MAX_WINDOW_DAYS - 1)}
                        value={windowEnd}
                        onChange={(e) => setWindowEnd(e.target.value)}
                        className={`${inputClass} mt-1 w-auto`}
                      />
                    </div>
                  </div>
                  {/* L'APERÇU DIT CE QUE LES DEUX DATES FONT — le nombre de
                      jours, qu'on ne compte plus soi-même. */}
                  <p className="mt-1 text-xs text-gray-500">{windowPreview}</p>
                  {/* CHOISIR LES REPAS, PLUS LES JOURS. « Choose exactly »
                      servait à préciser une fenêtre; les deux dates le font
                      seules. Le geste qui manquait est plus fin: dans cette
                      fenêtre-là, quels MOMENTS je mange chez moi. */}
                  {props.onAwaySaved && (
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="mt-2 text-xs font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
                    >
                      {mealCopy("meals.picker.open")}
                      {awayInWindow > 0 && (
                        <span className="ml-1 font-normal text-gray-500">
                          · {awayInWindow}
                        </span>
                      )}
                    </button>
                  )}
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

              {/* CE DONT ILS ONT ENVIE, POUR CES REPAS-LÀ. Séparé du contexte
                  juste en dessous, et séparé des goûts durables de la carte
                  « What you have told me about your eating »: trois durées de
                  vie différentes. Une envie se réécrit à chaque génération, une
                  contrainte de semaine aussi, un goût reste. */}
              <Field
                label={c("meals.form.preferences_label")}
                hint={preferencesCarried
                  ? c("meals.form.preferences_carried")
                  : c("meals.form.preferences_hint")}
                htmlFor="meals-preferences"
              >
                <textarea
                  id="meals-preferences"
                  className={`${inputClass} min-h-16`}
                  value={preferences}
                  placeholder={c("meals.form.preferences_placeholder")}
                  onChange={(e) => {
                    setPreferences(e.target.value);
                    setPreferencesCarried(false);
                  }}
                />
              </Field>

              {/* CE QUI ARRIVE CETTE SEMAINE-LÀ, et que la grille ne peut pas
                  dire. Elle exprime l'ABSENCE — « je ne mange pas ici » — au
                  jour et au repas près. Elle ne dit ni les invités, ni le four
                  en panne, ni le frigo vide du retour de vacances, qui changent
                  pourtant ce qu'il faut composer.

                  APRÈS l'envie, et pas avant: on lit « ce dont j'ai envie »
                  puis « ce qui contraint », et c'est l'ordre dans lequel le
                  prompt les présente aussi. */}
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
            {/* DEUX ONGLETS DÈS QU'UN SECOND PLAN EXISTE. Pas de primitive
                `Tabs` dans le dépôt, et deux entrées n'en justifient pas une:
                deux boutons en contrôle segmenté portent la même information
                avec `aria-pressed`. */}
            {plans.next
              ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={tab === "current" ? "primary" : "secondary"}
                    aria-pressed={tab === "current"}
                    onClick={() => setTab("current")}
                  >
                    {c("meals.result.tab_current")}
                  </Button>
                  <Button
                    size="sm"
                    variant={tab === "next" ? "primary" : "secondary"}
                    aria-pressed={tab === "next"}
                    onClick={() => setTab("next")}
                  >
                    {c("meals.result.tab_next")}
                  </Button>
                </div>
              )
              : <SectionLabel className="mb-0">{c("meals.result.title")}</SectionLabel>}
            {/* LES DEUX GESTES DE CET ÉCRAN, CÔTE À CÔTE ET DE MÊME FORME.
                La liste de courses avait son propre bouton, plus gros, posé
                au-dessus du titre: deux traitements différents pour deux
                actions du même rang, qu'il fallait comprendre deux fois. */}
            <div className="flex flex-wrap items-center gap-2">
              {hasWeek && !building && (result?.cookingSessions.length ?? 0) > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSessionsOpen(true)}
                >
                  {mealCopy("meals.sessions.title")}
                </Button>
              )}
              {hasWeek && !building && (result?.shoppingList.length ?? 0) > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShoppingOpen(true)}
                >
                  {c("meals.result.shopping_title")}
                </Button>
              )}
              {/* PRÉPARER LA SUITE. N'apparaît que s'il n'y a pas déjà un plan
                  suivant: au plus deux plans vivants, et la contrainte
                  d'exclusion le refuserait de toute façon. */}
              {hasWeek && !showForm && !householdOwner && !plans.next && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={building}
                  onClick={() => {
                    setFormIntent("prepare_next");
                    setTab("current");
                    // Le prochain plan démarre APRÈS le courant par défaut:
                    // c'est le cas sans troncature, donc celui qui ne coûte
                    // rien à personne.
                    setWindowStart(nextDefaultStart);
                    setWindowEnd(addDays(nextDefaultStart, MAX_WINDOW_DAYS - 1));
                    setFormOpen(true);
                  }}
                >
                  {c("meals.rebuild.prepare_next")}
                </Button>
              )}
              {/* Il ne s'affiche pas quand le formulaire est déjà ouvert (il
                  ouvrirait ce qui est ouvert) ni quand il n'y a pas de semaine
                  (il n'y a pas d'« autre »). */}
              {/* ⚠️ `!householdOwner` — voir la constante: le maître d'un
                  foyer compose depuis `/app/household`, et ce bouton-ci lui
                  écrirait un plan personnel que son propre écran masque. */}
              {hasWeek && !showForm && !householdOwner && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={building}
                  onClick={() => {
                    setFormIntent("replace_current");
                    setFormOpen(true);
                  }}
                >
                  {building ? c("meals.form.building") : c("meals.rebuild.button")}
                </Button>
              )}
            </div>
          </div>

          {/* LE PANNEAU S'OUVRE SOUS SON BOUTON. Il reste MONTÉ quand il est
              replié: les ratures sont éphémères, mais pas au point de
              disparaître parce qu'on est allé relire un plat. Il disparaît en
              revanche pendant une génération — il décrit des plats qu'on est en
              train de remplacer, et faire ses courses dessus serait acheter
              pour un plan mort. */}
          {!building && (
            <>
              {/* LES VAGUES D'ACHAT (PIVOT-FOYER §3) arrivent par les trois
                  dernières props. Les entrées existent DÉJÀ sur la ligne: les
                  préparations portent leur `cook_on`, la fenêtre porte ses
                  dates. Le panneau en déduit quand acheter quoi, et se rabat
                  sur la liste plate d'avant quand il manque l'une des trois. */}
              <ShoppingListPanel
                items={result?.shoppingList ?? []}
                mealId={result?.mealId ?? null}
                open={shoppingOpen}
                onClose={() => setShoppingOpen(false)}
                preparations={result?.preparations ?? []}
                startsOn={result?.startsOn ?? null}
                durationDays={result?.durationDays ?? null}
              />
              {/* MONTÉE MÊME FERMÉE — `Modal` rend `null`, il ne démonte pas —
                  donc les recettes dépliées survivent à un aller-retour vers un
                  plat. Elle disparaît en revanche pendant une génération: elle
                  décrit des préparations qu'on est en train de remplacer. */}
              <CookingSessions
                sessions={result?.cookingSessions ?? []}
                preparations={result?.preparations ?? []}
                open={sessionsOpen}
                onClose={() => setSessionsOpen(false)}
              />
            </>
          )}

          {/* MONTÉE EN PERMANENCE, comme les deux fenêtres voisines: `Modal`
              rend `null` fermé sans démonter l'appelant, donc une grille
              modifiée survit à une fermeture accidentelle. */}
          {props.onAwaySaved && (
            <MealPickerGrid
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              days={askedDays.tokens}
              dates={askedDays.dates}
              rhythm={props.rhythm ?? []}
              away={props.awayDays ?? []}
              busy={pickerBusy}
              onSave={async (next) => {
                setPickerBusy(true);
                try {
                  await props.onAwaySaved!(next);
                  setPickerOpen(false);
                } finally {
                  setPickerBusy(false);
                }
              }}
            />
          )}
          {/* UNE COCHE QUI N'A PAS PRIS SE DIT. Sans ça, la case revient à sa
              place sans un mot et l'élève croit avoir mal visé — puis retape,
              indéfiniment, sur une écriture que la base refuse. */}
          {ticks.error && (
            <p className="mb-3 text-sm text-red-600">
              {mealCopy("meals.tick.failed")}
            </p>
          )}
          {/* ── L8/O2 · LA GÂCHETTE DE LA PRISE DE MAIN ────────────────────
              Elle est ICI, au-dessus du plan de l'onglet REGARDÉ, parce que le
              geste porte sur CE plan-là et sur aucun autre — même prudence que
              « Build another plan » juste au-dessus, qui a déjà coûté une
              semaine de courses le jour où il devinait sa cible.

              Sans ce bouton, `keel_validate_meal_plan` n'a aucun appelant:
              personne ne prend la main, donc rien n'est jamais proposé au
              maître, donc la fusion, la défusion et l'avertissement n'existent
              pour aucun utilisateur réel. */}
          <TakeTheHandCard
            place={place}
            plan={result ?? null}
            onValidated={async () => {
              const loaded = await loadMealPlans(userId, browserLocalDate());
              setPlans({ current: loaded.current, next: loaded.next });
            }}
          />
          {building
            ? (
              <Card tone="dashed">
                <p className="text-sm text-gray-500">{c("meals.rebuild.building")}</p>
              </Card>
            )
            : groups.length === 0
            // ⚠️ PAS CETTE PHRASE-LÀ AU MAÎTRE D'UN FOYER. Elle dit « dis-moi
            // par où commencer CI-DESSUS », et il n'y a plus de formulaire
            // au-dessus pour lui (D2: il compose depuis `/app/household`). La
            // carte de prise de main juste au-dessus porte déjà l'explication
            // ET la porte: ajouter une consigne qui vise un formulaire absent
            // ferait chercher un bouton qui n'existe pas.
            ? householdOwner ? null : (
              <Card tone="dashed">
                <p className="text-sm text-gray-500">{c("meals.result.empty")}</p>
              </Card>
            )
            : (
              <PlanResult
                dishes={result?.dishes ?? []}
                preparations={result?.preparations ?? []}
                cookingSessions={result?.cookingSessions ?? []}
                startsOn={startDate}
                durationDays={durationDays}
                today={today}
                emptyLabel={c("meals.result.empty")}
                // ── FF-053 · CE QUI EXPLIQUE UNE CASE VIDE ─────────────────
                // Le rythme donne les LIGNES; les trois autres donnent les
                // quatre silences. `awayDays` vient de l'écran (il pilote déjà
                // la grille de créneaux); les deux suivants viennent de la
                // RÉPONSE de la fonction, qui seule sait ce qu'elle a lu.
                rhythm={props.rhythm ?? []}
                awayDays={props.awayDays ?? []}
                fixedIntakes={result?.fixedIntakes ?? []}
                dayProperties={result?.dayProperties ?? []}
                // LA COCHE RESTE ICI. `PlanResult` ne sait pas qui est
                // cochable — la règle (aujourd'hui et le passé, jamais
                // l'avenir) vit dans `useMealTicks`, et le brouillon n'en
                // passera aucune.
                tick={(dish, date) => ticks.bind(dish, date)}
                // ── FF-059 · A ET B ────────────────────────────────────────
                // Passés SEULEMENT quand le serveur a rendu des chiffres.
                // `undefined` sinon — et `PlanResult` n'a alors ni ligne de
                // base à afficher, ni rien à chercher. La garde n'est pas un
                // `if` d'affichage: c'est une prop qui n'existe pas.
                energy={energy.showing ? ((dish) => energy.forDish(dish)) : undefined}
                dayEnergy={energy.showing ? ((day) => energy.forDay(day)) : undefined}
              />
            )}
          {/* L'INTERRUPTEUR — porte ④, et la seule que l'élève tient.
              Il ne s'affiche QUE si les trois autres portes sont ouvertes
              (`switchOfferable`): proposer « voir les calories » à quelqu'un
              que le plancher TCA, son âge ou son coach protègent, ce serait
              encore lui parler de calories. */}
          {energy.ready && energy.switchOfferable && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                onClick={() => energy.toggle(!energy.showing)}
              >
                {energy.showing
                  ? mealCopy("meals.energy.switch_off")
                  : mealCopy("meals.energy.switch_on")}
              </Button>
              <span className="text-xs text-gray-400">
                {mealCopy("meals.energy.switch_hint")}
              </span>
              {energy.error && (
                <span className="text-xs text-red-600">
                  {mealCopy("meals.energy.switch_failed")}
                </span>
              )}
            </div>
          )}
          {/* Un plan de foyer à plusieurs bouches n'a pas de chiffre, et on dit
              pourquoi: la part de chacun est une PHRASE, pas un nombre. Le
              silence se lirait comme une panne. */}
          {energy.ready && energy.abstention === "household_portions_not_numeric" && (
            <p className="mt-3 text-xs text-gray-400">
              {mealCopy("meals.energy.household_abstention")}
            </p>
          )}
        </section>

    </div>
  );
}
