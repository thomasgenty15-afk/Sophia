// ⚠️ LES TYPES SEULS. `readCookingStyle` / `readGroceryRuns` étaient importés
// ici sans le moindre appel: la relecture passe par `readPlanInputs`, qui les
// utilise déjà. Un import mort n'est pas neutre — il fait croire à un second
// lecteur du même vocabulaire.
import {
  type CookingStyle,
  type GroceryRunsAnswer,
} from "../api/cookingPlan";
import React from "react";
import { ChevronDown } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
// ⛔ `AwayMark` ET PLUS `AwayDay` SUR LES ABSENCES — DÉFAUT P1 (L6,
// 2026-08-18). Ce composant monte DEUX grilles de présence: celle d'une bouche
// du foyer et celle du titulaire. Toutes deux réécrivent ce qu'on leur donne,
// donc un tableau reçu sans le jeton `kind` fait ressortir « dehors » en
// « absent » — mesuré au navigateur avant ce lot. Le type est la garde.
import { type AwayMark } from "../lib/presenceMarks";
import {
  type EatingOccasionSlot,
  type GeneratedMealResult,
  loadMealPlans,
} from "../api/mealGeneration";
import {
  MAX_WINDOW_DAYS,
  type MealWindowRequest,
  planEndsOn,
  resolveRequestedWindow,
  windowDayOrder,
} from "../api/mealWindow";
// ⚠️ TOUT VIENT DE `planBudget`, ET RIEN DE `onboarding`. Le second porte la
// copie de l'entonnoir (allergènes, objectifs, motifs de refus); l'importer
// ici, même pour une constante, traîne tout son graphe dans le paquet de
// /app/plan — et la garde de coutures compte les namespaces ATTEINTS, pas les
// namespaces utilisés.
import {
  assessBudget,
  BUDGET_MAX,
  budgetMouthsFor,
  readBudgetMarket,
  readPlanInputs,
  savePlanInputs,
} from "../api/planBudget";
import { mealCopy } from "../api/mealLabels";
import {
  ENVY_MAX_CHARS,
  generateHouseholdMeal,
  type HouseholdView,
  loadEnvyLine,
  loadHousehold,
  loadMyHouseholdPlace,
  setMemberAway,
  submitEnvy,
} from "../api/household";
import { mayCompose } from "../api/planRouting";
// LOT B — le mode de cuisson demandé à la composition.
// « TOUT DANS UNE SESSION DE CUISINE » — la case, et la porte qui la conditionne.
import OneCookingSessionField from "./OneCookingSessionField";
import KitchenEquipmentCard from "./KitchenEquipmentCard";
import CookingStyleField from "./CookingStyleField";
import GroceryRunsField from "./GroceryRunsField";
import {
  hasFreezerDeclared,
  readKitchenEquipment,
} from "../api/kitchenEquipment";
import type { PracticalConstraints } from "../api/practicalConstraints";
import { edgeRefusalKey } from "../copy/planRefusals";
import { t } from "../i18n/t";
import { formatBudgetAmount, formatDate } from "../i18n/format";
import { plural } from "../i18n/plural";
import TakeTheHandCard, { type HouseholdPlace } from "./TakeTheHandCard";
import PlanResult from "./plan/PlanResult";
import ShoppingListPanel from "./ShoppingListPanel";
import CookingSessions from "./CookingSessions";
import MealPickerGrid from "./MealPickerGrid";
import { } from "../api/mealStretch";
import { addDays, daysBetween, isIsoDate, weekStartFor } from "../api/dates";
import { browserLocalDate, useMealTicks, catchUpWindowStart } from "../lib/useMealTicks";
import { useMealEnergy } from "../lib/useMealEnergy";
import { EnergySwitches, EnergyTargetNote } from "./plan/EnergyReadout";
import { groupByDay } from "../lib/mealBuilderModel";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import { Field, inputClass } from "./ui/Field";

// LE CONSTRUCTEUR DE REPAS — le moteur `generate-meal-v1`, enfin relié.
//
// OÙ IL VIT, ET POURQUOI PAS AILLEURS
// -----------------------------------
// Il est monté sur `/app/plan`, l'écran de la SEMAINE. C'est là que l'élève
// vient chercher ce qu'il va manger. (`/app/meals`, qui montrait les IDÉES
// déposées par le coach — sa bibliothèque, pas une génération — a été retiré
// le 2026-09-03, P4: elle n'a plus de lecteur élève.)
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

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-03 — LE FORMULAIRE EST CELUI DE L'ENTONNOIR, PAS UN SECOND.
// ══════════════════════════════════════════════════════════════════════════
//
// DÉCISION PRODUIT, prise à l'écran: « c'est ce qu'il y a sur l'onboarding qui
// fait foi, il faudrait même que ce soit exactement la même interface ».
// L'étape 3 (`SetupPage#RequestStep`) est l'autorité; cette carte-ci pose
// désormais LES MÊMES questions, DANS LE MÊME ORDRE — plus une seule que
// l'entonnoir n'a pas: « Choisir les repas », la grille qui dit quels moments
// on mange chez soi sur la fenêtre demandée.
//
// ⛔ QUATRE CHAMPS SONT PARTIS, ET AUCUN N'ÉTAIT UN OUBLI DE L'ENTONNOIR:
//
//   · « On part d'où » (`mode`)          — l'entonnoir compose en `to_shop`
//     codé en dur (`draftInput`). Avec le choix part le garde-manger, qui
//     n'existait que dans l'autre branche: `mode` vaut maintenant `to_shop`
//     et `pantry` part vide, exactement comme le premier plan d'un compte.
//   · « Pour combien de personnes »      — `servings: 1` dans `draftInput`. À
//     plusieurs bouches, la question n'a jamais eu de sujet: le générateur du
//     foyer DÉDUIT les couverts de la présence, repas par repas.
//   · « Temps par session de cuisine »   — retiré de l'entonnoir par P2
//     (2026-09-03): `cooking_time_min` est DÉRIVÉ du style de cuisine
//     (`_shared/keel/cooking_plan.ts`). La valeur déjà en base n'est pas
//     effacée pour autant — voir `cookingTimeMin`, qui fait l'aller-retour.
//   · « Ce qui se passe cette semaine »  — `context: null` dans `draftInput`.
//
// ⚠️ CE QUI RESTE DE LEURS MOTS. Les clés (`meals.form.mode_*`,
// `meals.form.servings_label`, `meals.form.pantry_*`, `meals.form.context_*`,
// `plan.cooking.time_*`) restent dans les deux packs, orphelines, comme les
// trois libellés de fenêtre retirés avant elles: « les retirer dans le même
// geste que la refonte de l'écran ferait deux changements dans un seul diff,
// et c'est celui qu'on ne relit pas qui casse » (en-tête d'`en.ts`).
//
// ⚠️ ET L'ENVIE N'EST PLUS POSÉE DEUX FOIS. Cet écran montrait au maître d'un
// foyer DEUX zones de texte qui demandent la même chose — « ce dont tu as
// envie cette fois » (`preferences`, le corps de la requête) et « c'est la
// maison a envie de quoi ? » (`submitEnvy`, la ligne de la semaine). Une seule
// question maintenant, avec les mots de l'entonnoir.
//
// ⟳ 2026-09-10 · LOT 7 — ET UNE SEULE DESTINATION. « La destination suit la
// lane » n'a plus d'objet: il n'y a qu'un moteur, donc qu'un canal — la ligne
// de la semaine, que l'entonnoir écrivait déjà pour tout le monde. Envoyer
// aussi `preferences` mettrait la même phrase deux fois dans la consigne.

// ⚠️ LE `COPY` LOCAL DE CE FICHIER EST PARTI DANS LE SEED (lot 6). Ses 44
// entrées portaient DÉJÀ des noms de clés du seed (`meals.form.*`,
// `meals.result.*`), ce qui les rendait invisibles à `t()` comme au scanner de
// coutures — et TROIS d'entre elles (`meals.result.today`, `meals.result.past`,
// `meals.loading`) existaient en double dans `en.ts`, avec les mêmes valeurs et
// aucune ceinture pour signaler qu'elles avaient divergé. Voir le bloc « LOT 6 ·
// LE CONSTRUCTEUR DE REPAS » d'`en.ts`.

type LoadState = "loading" | "ready";

export interface MealBuilderProps {
  /**
   * LE RYTHME ET LES ABSENCES VIENNENT DE LA PAGE, qui lit déjà
   * `student_goals`. Les relire ici ferait un SECOND lecteur de la même
   * colonne, et la grille pourrait montrer autre chose que ce que le
   * générateur reçoit — le défaut exact que ce dépôt a payé sur le rythme.
   */
  rhythm?: readonly EatingOccasionSlot[];
  awayDays?: readonly AwayMark[];
  /** Reçoit la liste complète à écrire dans `practical_constraints`. */
  onAwaySaved?: (next: AwayMark[]) => Promise<void>;
  /**
   * LE FOYER VIENT DE COMPOSER — la page relit ce qui en dépend.
   *
   * « À table » (les parts par bouche) est écrit par la MÊME génération que le
   * plan, mais il se lit par une autre requête. Sans ce signal, le maître voit
   * son plan neuf au-dessus de parts périmées, et rien ne dit lesquelles sont
   * fausses.
   */
  onHouseholdComposed?: () => Promise<void>;
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
  /**
   * LE FOYER, quand il y en a un. `null` = pas lu, ou pas de foyer.
   *
   * Il sert TROIS choses sur cet écran: le compte de bouches qui décide du
   * générateur, la grille de présence par bouche, et la liste des prénoms.
   * Une lecture qui échoue laisse `null`, donc `otherMouths: 0`, donc la lane
   * INDIVIDUELLE — la direction sûre: `generate-household-meal-v1` refuserait
   * de toute façon un foyer qu'on n'a pas su lire, et il le refuserait APRÈS
   * l'attente.
   */
  const [household, setHousehold] = React.useState<HouseholdView | null>(null);
  /**
   * L'ENVIE DE LA SEMAINE — une ligne, pour tout le monde, écrite par le maître.
   *
   * ⚠️ ELLE EST ANCRÉE SUR LA SEMAINE DU PLAN, JAMAIS SUR AUJOURD'HUI.
   * Voir `envyWeek` plus bas: c'est le défaut que deux dates libres rendent
   * atteignable.
   */
  const [envy, setEnvy] = React.useState("");
  /**
   * L'EMPREINTE DE CE QUI A ÉTÉ LU, pour resynchroniser le champ d'envie quand
   * la semaine visée change.
   *
   * ⚠️ SANS ELLE, LE CHAMP EST UN INSTANTANÉ DE MONTAGE. Cicatrice payée deux
   * fois dans ce dépôt: un formulaire figé au montage affiche du VIDE qu'il n'a
   * pas encore lu, puis l'écrase au Save. Ici c'est pire qu'ailleurs, parce que
   * la semaine visée change au clavier — il suffit de corriger la date de
   * départ pour viser une autre ligne d'envie.
   */
  const [envyPrint, setEnvyPrint] = React.useState<string | null>(null);

  /**
   * ⛔ « ON PART D'OÙ » N'EST PLUS UNE QUESTION — 2026-09-03, ET LA CONSTANTE
   * `mode` A DISPARU AVEC LA LANE — 2026-09-10 (lot 7).
   *
   * C'était un `useState<MealMode>`, et le choix ouvrait le garde-manger.
   * L'écran a cessé de poser la question en septembre, la constante `to_shop`
   * a tenu sa place, et le moteur unique ne lit plus ce champ du tout: le
   * périmètre et les courses sont résolus serveur.
   *
   * ⚠️ LA COLONNE `mode` NE BOUGE PAS. Des lignes déjà écrites portent
   * `from_pantry`, et `buildMealPrompt` sait toujours les lire; ce qui
   * disparaît est le geste, puis son transport — jamais la donnée.
   */
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

  // ── MINUIT, ET C'EST LE MÊME DÉFAUT QUE SUR `SetupPage` ────────────────
  // `windowStart` est évalué UNE FOIS, au montage. Un onglet ouvert la veille
  // tient encore hier quand le serveur, sur le même fuseau, est déjà
  // aujourd'hui — et `resolveRequestedWindow` refuse un début dans le passé
  // (`bad_window`, HTTP 400, « Ces jours n'ont pas pu être lus »). Mesuré sur
  // la lane FOYER le 2026-08-20 à 00h03; cette lane-ci portait exactement le
  // même instantané, et son `truncationWarning` avalait déjà l'exception en
  // silence (`catch { return null }`) — donc l'écran ne prévenait de rien avant
  // le clic.
  //
  // ⚠️ SEUL LE PASSÉ EST CORRIGÉ. Une fenêtre posée plus loin volontairement
  // reste où la personne l'a mise. La règle vit dans `catchUpWindowStart`, une
  // seule fois pour les deux écrans: deux copies divergeraient, et c'est celle
  // qu'on relit le moins qui laisserait revenir le 400.
  React.useEffect(() => {
    const catchUp = () => {
      const today = browserLocalDate();
      setWindowStart((current) => catchUpWindowStart(current, today));
    };
    document.addEventListener("visibilitychange", catchUp);
    globalThis.addEventListener("focus", catchUp);
    catchUp();
    return () => {
      document.removeEventListener("visibilitychange", catchUp);
      globalThis.removeEventListener("focus", catchUp);
    };
  }, []);

  // ── CE QUI EST TAPÉ N'EST PAS ENCORE UNE DATE ─────────────────────────
  // Un `<input type="date">` passe par des valeurs VIDES et incomplètes
  // pendant qu'on l'édite au clavier. Écrire `e.target.value` directement
  // dans l'état ci-dessus revenait à faire entrer une demi-date dans
  // `addDays` et `daysBetween` — qui la donnent à `assertIsoDate`, qui jette
  // (R7: une date malformée est un throw, jamais un jour décalé en silence).
  // Le throw partait PENDANT LE RENDU, donc l'ErrorBoundary emportait la page
  // entière. Mesuré le 2026-08-18: la fenêtre du plan était inéditable au
  // clavier, et rien à l'écran ne disait pourquoi.
  //
  // La garde n'est pas touchée. Le BROUILLON porte ce qui est tapé, l'ÉTAT
  // porte ce qui est valide, et rien ne se décale en silence: une date
  // incomplète ne bouge simplement pas encore la fenêtre. Les deux effets
  // ci-dessous rendent au champ ce que le bornage a corrigé — sans eux,
  // l'écran afficherait une date que le calcul n'utilise pas.
  const [startDraft, setStartDraft] = React.useState(windowStart);
  const [endDraft, setEndDraft] = React.useState(windowEnd);
  React.useEffect(() => setStartDraft(windowStart), [windowStart]);
  React.useEffect(() => setEndDraft(windowEnd), [windowEnd]);

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

  /**
   * ── L'ANCRE DE L'ENVIE — LE DÉFAUT QUE DEUX DATES LIBRES RENDENT ATTEIGNABLE ──
   *
   * L'envie est écrite dans `household_envy_submissions` sous une `week_start`,
   * et le générateur la RELIT sur le lundi ISO de la DATE DE DÉPART du plan
   * (`weekStartOf(startsOn)`). L'écran du foyer, lui, l'écrivait sur
   * `weekStartFor(AUJOURD'HUI)`.
   *
   * Tant que la fenêtre était codée en dur (« d'ici dimanche », donc démarrant
   * toujours aujourd'hui), les deux ancres COÏNCIDAIENT et le défaut était
   * invisible. Dès qu'on donne deux champs de date libres, un plan composé
   * samedi pour une fenêtre qui démarre lundi lit une ancre que PERSONNE n'a
   * écrite: l'envie disparaît, sans erreur et sans trace.
   *
   * On écrit donc sur la semaine du DÉPART CHOISI, la même que celle que le
   * générateur relira — et on la recalcule à chaque changement du champ, plutôt
   * que de la figer au montage.
   *
   * ⚠️ LE CÔTÉ LECTURE EST BACKEND ET N'EST PAS RÉPARÉ ICI. Ce qui suit ferme
   * la moitié écriture; l'autre moitié appartient au lot du moteur.
   */
  const envyWeek = React.useMemo(
    () => weekStartFor(windowStart, "mon"),
    [windowStart],
  );

  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-10 · LOT 7 — AI-JE LE DROIT DE COMPOSER. UN SEUL MOTEUR.
   * ══════════════════════════════════════════════════════════════════════
   *
   * Cette constante s'appelait `composingForHousehold` et répondait à « quel
   * moteur ». Il n'y en a plus qu'un: `generate-household-meal-v1` sert une
   * bouche comme il en sert six, et le périmètre est résolu SERVEUR depuis le
   * foyer rattaché au compte. La question qui reste est celle du DROIT.
   *
   * ⛔ ET IL N'Y A PAS DE CHOIX « POUR MOI / POUR LE FOYER » À METTRE À LA
   * PLACE. Le périmètre n'est pas une préférence d'écran.
   *
   * ⚠️ `place === null` NE FERME RIEN, et c'est écrit dans `composeRight`: la
   * lecture peut être en cours, ou avoir échoué (`loadMyHouseholdPlace` rend
   * alors « pas de foyer »). Fermer sur du non-lu amputerait l'écran du chemin
   * MAJORITAIRE pendant chaque chargement.
   *
   * ⚠️ IL EST CALCULÉ ICI, AVANT TOUTE SORTIE ANTICIPÉE, parce qu'un `useEffect`
   * le lit: un hook posé après le `return` de chargement changerait l'ordre des
   * hooks entre deux rendus.
   */
  const canCompose = mayCompose(place);

  /**
   * L'ENVIE DÉJÀ ÉCRITE POUR LA SEMAINE VISÉE, reproposée.
   *
   * ⚠️ LA PORTE DE CHARGEMENT EST `envyPrint`, ET ELLE EST OBLIGATOIRE.
   * Un champ figé au montage afficherait du vide qu'il n'a pas encore lu, puis
   * l'écraserait au premier envoi — cicatrice payée deux fois ici. L'empreinte
   * est la SEMAINE lue: tant qu'elle ne correspond pas à `envyWeek`, ce qui est
   * affiché ne décrit pas la semaine visée et doit être remplacé.
   *
   * ⚠️ ET ON N'ÉCRASE PAS UNE SAISIE EN COURS SUR LA MÊME SEMAINE. La condition
   * porte sur le changement d'ANCRE, pas sur chaque rendu: sans ça, corriger
   * une lettre déclencherait une relecture qui reposerait l'ancienne ligne.
   */
  React.useEffect(() => {
    // ⟳ 2026-09-10 · LOT 7 — PLUS DE GARDE DE LANE ICI. La ligne de la semaine
    // est le SEUL canal d'envie depuis qu'il n'y a qu'un moteur, donc elle se
    // relit pour tout le monde. Un compte sans foyer n'en a simplement aucune
    // (RLS), et `loadEnvyLine` rend `null` — un état NORMAL, pas une attente.
    if (!canCompose) return;
    if (envyPrint === envyWeek) return;
    let cancelled = false;
    (async () => {
      try {
        const line = await loadEnvyLine(envyWeek);
        if (cancelled) return;
        setEnvy(line ?? "");
        setEnvyPrint(envyWeek);
      } catch {
        // Une lecture qui échoue ne pose PAS une ligne inventée, et ne marque
        // pas l'empreinte: la semaine reste « non lue », donc une réouverture
        // réessaiera au lieu de croire qu'il n'y avait rien.
        if (!cancelled) setEnvy("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canCompose, envyWeek, envyPrint]);

  /**
   * QUELLE BOUCHE A SA GRILLE OUVERTE. `null` = aucune.
   *
   * Une seule à la fois: N grilles ouvertes se recouvriraient, et la fenêtre du
   * kit est une feuille collée en bas sous 640 px.
   */
  const [awayFor, setAwayFor] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerBusy, setPickerBusy] = React.useState(false);
  // ── TROIS CHAMPS RETIRÉS DE L'ÉCRAN, TROIS COLONNES GARDÉES ────────────
  // `slot` (« A particular meal ») demandait UN créneau pour toute la fenêtre.
  // La grille « Which meals, which days » dit la même chose au jour près, donc
  // le menu déroulant ne pouvait plus qu'entrer en conflit avec elle.
  //
  // `context` (« Ce qui se passe cette semaine ») avait déjà été retiré une
  // première fois le 2026-08-08, puis remis. Il repart le 2026-09-03 avec
  // l'alignement sur l'étape 3, qui envoie `context: null` sur ses trois
  // gestes. Ce N'EST PAS un doublon de la grille: la grille dit « je ne mange
  // pas ici », elle ne dit ni « des invités samedi », ni « le four est en
  // panne ». Il ne reste donc plus AUCUN champ de contrainte en prose —
  // seulement l'envie du moment, juste en dessous. C'est la question ouverte
  // de FF-003, qui proposait de LIRE cette prose plutôt que de la supprimer.
  //
  // `servings` (« Pour combien de personnes ») valait déjà `1` en dur dans
  // l'entonnoir, et n'avait aucun sujet à plusieurs bouches: le générateur du
  // foyer déduit les couverts de la PRÉSENCE, repas par repas.
  //
  // Les trois valeurs partent donc en constante dans la requête, et les
  // colonnes `meal_slot` / `context` / `servings` restent: des lignes déjà
  // écrites les portent, et `buildMealPrompt` sait toujours les lire.
  // ⟳ 2026-09-10 · LOT 7 — `slot` ET `servings` ONT DISPARU AVEC LA LANE
  // INDIVIDUELLE, qui était la seule à les transporter. `context` reste: le
  // moteur unique le lit (`String(body.context …)`), et cet écran le pose à
  // `null` faute de champ pour l'écrire.
  const context = null;
  /**
   * L'ARGENT DE CE PLAN-LÀ — reposé À CHAQUE composition, pré-rempli avec le
   * chiffre de la dernière fois. Voir `api/planBudget.ts` pour ce que cette
   * distinction garde ouvert: un montant appliqué sans être montré redeviendrait
   * le réglage de profil qu'on vient de retirer d'« À propos de toi ».
   */
  const [budget, setBudget] = React.useState("");
  /**
   * LE MARCHÉ DE CE COMPTE — `null` hors de France et des États-Unis, et c'est
   * l'état NORMAL pour le reste du monde. Sans lui, aucun plancher: la grille
   * de prix n'existe que sur deux marchés, et convertir en inventerait un
   * troisième (`_shared/keel/budget_floor.ts`).
   *
   * ⚠️ `null` TANT QUE LA LECTURE N'A PAS RÉPONDU, donc le champ n'oppose aucun
   * refus pendant ce temps-là. La direction est voulue: un plancher qui
   * refuserait sur une lecture pas encore revenue refuserait quelqu'un pour une
   * raison qui ne le concerne pas.
   */
  const [budgetMarket, setBudgetMarket] = React.useState<"fr" | "us" | null>(null);
  /**
   * ⛔ « TEMPS PAR SESSION DE CUISINE » N'EST PLUS DEMANDÉ ICI — 2026-09-03.
   *
   * La rangée de six durées a été retirée de l'entonnoir par P2 (« personne ne
   * sait répondre 45 avant d'avoir vu le plan »), et `cooking_time_min` est
   * maintenant DÉRIVÉ du style de cuisine (`_shared/keel/cooking_plan.ts`).
   * Cet écran la posait encore: deux autorités sur la même colonne, dont une
   * que l'entonnoir contredit à la composition suivante.
   *
   * ⚠️ LA VALEUR FAIT QUAND MÊME L'ALLER-RETOUR, ET C'EST TOUT L'INTÉRÊT DE
   * CET ÉTAT. `savePlanInputs` réécrit la clé à chaque composition: ne plus la
   * lire reviendrait à écrire `null` par-dessus la réponse des comptes qui ont
   * répondu AVANT P2, et le moteur retomberait sur son défaut sans que rien ne
   * le dise. On relit, on réécrit à l'identique — exactement ce que fait
   * l'entonnoir avec `answers.cookingTimeMin`.
   */
  const [cookingTimeMin, setCookingTimeMin] = React.useState<number | null>(null);
  /**
   * ⟳ P2 (2026-09-03) — LE STYLE ET LA CADENCE DE COURSES.
   *
   * ⚠️ ILS SE PRÉ-REMPLISSENT, contrairement à « une seule session » et à
   * la forme de cuisine: ce sont des propriétés DURABLES (« j'aime
   * cuisiner » ne change pas d'une semaine à l'autre), écrites dans
   * `practical_constraints`. Repartir de vide à chaque composition ferait
   * effacer la réponse au premier `savePlanInputs`.
   */
  const [cookingStyle, setCookingStyle] = React.useState<CookingStyle | null>(null);
  // ⟳ 2026-09-09 — L'ÉTAT PORTE AUSSI « peu importe ». Le garder en
  // `GroceryRuns | null` aurait forcé un `as` au site de montage, et le `as`
  // désarme le typecheck en silence — cicatrice mesurée dans ce dépôt.
  const [groceryRuns, setGroceryRuns] = React.useState<GroceryRunsAnswer | null>(
    null,
  );
  /**
   * ⛔ ICI VIVAIT L'ÉTAT DE « COMMENT TU CUISINES CETTE SEMAINE » — retiré le
   * 2026-09-06 avec le champ, jugé en double avec « Comment voulez-vous
   * cuisiner ? » rendu juste au-dessus. Le détail de ce que ça coûte est dans
   * `SetupPage.tsx`, à la place du champ.
   */
  /**
   * « TOUT CUISINER EN UNE SEULE FOIS » — `false` par défaut, et c'est le
   * comportement d'avant ce lot, au caractère près.
   *
   * ⚠️ IL NE SE PRÉ-REMPLIT PAS, exactement comme `cookingShape` juste
   * au-dessus et pour le même motif: le budget et les jours de cuisine sont des
   * FAITS de la vie de quelqu'un, dont la dernière réponse est un défaut
   * raisonnable; celui-ci est un ARBITRAGE de semaine. Le rejouer en silence
   * serait le réglage de profil que ce produit refuse d'écrire.
   */
  const [oneCookingSession, setOneCookingSession] = React.useState(false);
  /**
   * « JE CUISINE LA VEILLE DU PREMIER JOUR » — `false` par défaut.
   *
   * ⚠️ IL NE SE PRÉ-REMPLIT PAS non plus: c'est un arbitrage de CETTE
   * semaine-ci (« ce dimanche-là je suis chez moi »), pas un fait durable.
   */
  /**
   * LA COLONNE `practical_constraints`, TELLE QU'ELLE ÉTAIT AU CHARGEMENT.
   *
   * ⚠️ `null` VEUT DIRE « PAS ENCORE LU », ET C'EST UNE PORTE, pas une commodité.
   * `KitchenEquipmentCard` ne rend aucun contrôle tant qu'elle est `null` —
   * sinon il afficherait sept cases décochées et les écrirait telles quelles au
   * premier clic (cicatrice « formulaire figé au montage sans gate »). Et la
   * porte du congélateur, elle, lit `false` tant qu'on n'a rien lu: la case est
   * grisée le temps du chargement, jamais proposée à tort.
   */
  const [planConstraints, setPlanConstraints] = React.useState<
    PracticalConstraints | null
  >(null);
  const [hasGoalRow, setHasGoalRow] = React.useState(false);
  /**
   * CE FOYER A-T-IL DÉCLARÉ UN CONGÉLATEUR ? — la porte de l'option, lue UNE
   * fois et passée aux deux endroits qui en ont besoin.
   *
   * ⛔ `hasFreezerDeclared`, JAMAIS `includes("freezer")` À LA MAIN. « Pas de
   * congélateur » et « on ne lui a jamais demandé » doivent rendre le même
   * `false`, et c'est cette fonction-là qui le garantit — en miroir du serveur,
   * comparé sur les trois états par `api/freezerMirror.int.test.ts`.
   */
  const hasFreezer = hasFreezerDeclared(readKitchenEquipment(planConstraints));
  /**
   * ⟳ 2026-09-10 · LOT 7 — `preferences` / `preferencesCarried` SONT PARTIS.
   *
   * Ils portaient l'envie de la LANE INDIVIDUELLE, dans le corps de la
   * requête. Il n'y a plus qu'un moteur, donc plus qu'un canal d'envie: la
   * ligne de la semaine (`envy`, écrite par `submitEnvy`, relue par
   * `loadEnvyLine`), qui est déjà celle de l'entonnoir — `SetupPage` l'écrit
   * pour TOUT LE MONDE, solo compris, et depuis avant ce lot.
   *
   * ⛔ ON N'ENVOIE PAS LES DEUX. La même phrase dans `body.preferences` ET dans
   * `household_envy_submissions` arriverait deux fois dans la consigne — une
   * fois comme ligne de la semaine, une fois comme envie du moment.
   *
   * ⚠️ CE QUI SE PERD, ET IL FAUT LE SAVOIR: la légende « repris de la dernière
   * fois » n'a plus de sujet, et sa clé a été retirée des deux packs avec elle.
   * Elle lisait `student_generated_meals.preferences` du dernier plan; la ligne
   * de la semaine, elle, est ancrée sur la SEMAINE VISÉE — elle ne se « reprend »
   * pas, elle se relit, et une semaine neuve part vide parce qu'elle est vide.
   */
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
      let inHousehold = false;
      try {
        const mine = await loadMyHouseholdPlace(userId);
        inHousehold = mine.inHousehold;
        if (!cancelled) setPlace(mine);
      } catch {
        if (!cancelled) setPlace(null);
      }
      // ⚠️ DEUX `try` SÉPARÉS, ET C'EST LA CORRECTION QUI COMPTE. Groupés, une
      // lecture de FOYER en panne effacerait la PLACE déjà lue — donc la carte
      // de prise de main — pour une requête qui ne la concerne pas.
      //
      // LE FOYER N'EST LU QUE S'IL Y EN A UN: pour un compte individuel, qui
      // est le chemin majoritaire, c'est une requête de moins.
      if (inHousehold) {
        try {
          const view = await loadHousehold(userId);
          if (!cancelled) setHousehold(view);
        } catch {
          if (!cancelled) setHousehold(null);
        }
      }
      // LE MONTANT DE LA DERNIÈRE FOIS, PROPOSÉ — comme le contexte et l'envie
      // plus bas, et pour la même raison: retaper le même chiffre chaque semaine
      // est la friction qui fait qu'on finit par ne plus répondre du tout.
      // Une lecture qui échoue laisse le champ VIDE, jamais un chiffre inventé:
      // la garde de `build()` le réclamera, et ça vaut mieux qu'un budget que
      // personne n'a donné.
      try {
        const last = await readPlanInputs(userId);
        if (!cancelled) {
          if (last.budgetAmount !== null) setBudget(String(last.budgetAmount));
          // ⟳ 2026-09-03 — RELUE POUR ÊTRE RÉÉCRITE À L'IDENTIQUE, plus pour
          // remplir un champ: la rangée de durées est partie de cet écran
          // comme de l'entonnoir. Sans cette ligne, `savePlanInputs` écrirait
          // `null` par-dessus la réponse d'un compte d'avant P2.
          setCookingTimeMin(last.cookingTimeMin);
          // ⟳ P2 (2026-09-03) — LE PRÉ-REMPLISSAGE, ET IL EST OBLIGATOIRE.
          // Ces deux réponses sont DURABLES: sans cette relecture, le premier
          // `savePlanInputs` de la composition suivante écrirait `null` sur les
          // deux et effacerait la réponse donnée dans l'entonnoir — la
          // cicatrice « formulaire figé au montage » payée sur `SetupPage`.
          //
          // ⚠️ POSÉ MÊME À `null`: ici `null` EST la valeur relue (« pas encore
          // répondu »), pas une absence de lecture. Un `if (… !== null)` comme
          // au-dessus laisserait un état obsolète si la réponse était effacée
          // ailleurs entre deux montages.
          setCookingStyle(last.cookingStyle);
          setGroceryRuns(last.groceryRuns);
          // ⛔ LA MÊME LECTURE, PAS UN SECOND ALLER-RETOUR: `readPlanInputs`
          // ouvre déjà cette colonne pour le budget et les jours de cuisine.
          setPlanConstraints(last.practicalConstraints);
          setHasGoalRow(last.hasGoal);
        }
      } catch {
        // Une lecture qui échoue laisse les champs VIDES, jamais des valeurs
        // inventées: les gardes de `build()` les réclameront, et ça vaut mieux
        // qu'une semaine composée sur des jours que personne n'a donnés.
        if (!cancelled) setBudget("");
      }
      // LE MARCHÉ, POUR LE PLANCHER — une lecture à part, et qui ne peut pas
      // faire échouer le montage: `readBudgetMarket` rend `null` sur une panne
      // plutôt que de jeter. Pas de plancher vaut mieux qu'un plancher posé sur
      // une lecture ratée.
      const market = await readBudgetMarket(userId);
      if (!cancelled) setBudgetMarket(market);
      try {
        const loaded = await loadMealPlans(userId, browserLocalDate());
        if (!cancelled) {
          setPlans({ current: loaded.current, next: loaded.next });
          // On ouvre sur le plan qu'on VIT. Ouvrir sur le suivant ferait lire
          // les repas de la semaine prochaine à quelqu'un qui vient voir ce
          // qu'il mange ce soir.
          setTab(loaded.current ? "current" : loaded.next ? "next" : "current");
          // ⛔ LE CONTEXTE NE SE REPROPOSE PLUS: LE CHAMP N'EXISTE PLUS. Le
          // reprendre dans un état que rien ne rend l'aurait renvoyé au moteur
          // sans qu'aucun écran ne puisse le contredire — « des invités
          // samedi » rejoué toutes les semaines, invisible.
          //
          // L'ENVIE, ELLE, SE REPROPOSE: « mezze d'été » vaut souvent encore la
          // semaine suivante, et la légende dit d'où le texte vient pour qu'une
          // envie périmée saute aux yeux plutôt que de repartir en silence.
          // ⛔ ET L'ENVIE NE SE REPROPOSE PLUS DEPUIS LE DERNIER PLAN (lot 7).
          // Elle se relit sur la SEMAINE VISÉE (`loadEnvyLine`, l'effet plus
          // haut), qui est un autre fait: recopier ici la phrase du plan
          // précédent l'écraserait au premier rendu, et écraserait donc une
          // ligne que le maître a peut-être écrite depuis `/app/household`.
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
      if (w.durationDays === 1) return t("meals.form.window_one_day");
      // ⚠️ CETTE LIGNE A ÉTÉ ANGLAISE ET NUE JUSQU'AU 2026-08-14, et aucun test
      // ne pouvait le voir: c'était un littéral, pas une clé. Elle rendait
      // « 2026-08-14 → 2026-08-20 · 7 days » à un foyer français — une date ISO
      // que personne ne lit à voix haute, et un mot anglais au milieu de la
      // page. Trouvé en REGARDANT l'écran, pas en lisant le code.
      return t("meals.form.window_span")
        .replace("{from}", formatDate(w.startsOn, { year: false }))
        .replace("{to}", formatDate(ends, { year: false }))
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
  }, [windowRequest]);

  /**
   * Le lendemain de la fin du plan courant — le départ qui ne tronque RIEN.
   *
   * C'est le défaut de « Prepare next plan », parce que c'est le seul choix qui
   * ne coûte rien à personne. L'élève peut le ramener plus tôt; l'écran lui dira
   * alors ce que ça retire.
   */
  // ⚠️ EXTRAIT AVANT LES MÉMOS. `plans` est un `useState`, pas un `useRef` —
  // mais `plans.current` porte le nom d'un ref, et la règle des hooks refuse
  // par principe une dépendance qui s'écrit `.current`. Le nommer ici lève
  // l'ambiguïté sans changer ce qui est comparé.
  const currentPlan = plans.current;
  const nextDefaultStart = React.useMemo(() => {
    const today = browserLocalDate();
    if (!currentPlan?.startsOn) return today;
    const after = addDays(
      planEndsOn(currentPlan.startsOn, currentPlan.durationDays),
      1,
    );
    return after > today ? after : today;
  }, [currentPlan]);

  /**
   * CE QUE LA FENÊTRE DEMANDÉE RETIRERAIT AU PLAN COURANT.
   *
   * Dit AVANT le clic, et il nomme les jours: ce sont peut-être des jours pour
   * lesquels l'élève a déjà fait ses courses, et cette dépense-là ne se
   * rembourse pas. `null` quand rien ne bouge.
   */
  const truncationWarning = React.useMemo(() => {
    const current = currentPlan;
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
    return t("meals.rebuild.truncates")
      .replace("{days}", String(lost))
      .replace("{from}", String(current.durationDays))
      .replace("{to}", String(kept));
  }, [currentPlan, windowRequest]);
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
    // Un plan ÉCRIT: pas d'aperçu à chiffrer ici (2026-09-08).
    draftId: null,
    dishes: result?.dishes ?? [],
  });

  // ⛔ LE GARDE-MANGER EST PARTI AVEC « ON PART D'OÙ » — 2026-09-03 — ET SA
  // CONSTANTE VIDE AVEC LA LANE INDIVIDUELLE — 2026-09-10 (lot 7). Sa garde de
  // saisie (`meals.form.pantry_required`) était déjà partie avec elle: un refus
  // sans champ à corriger est un bouton mort.

  /**
   * ⛔ LE PLANCHER DU BUDGET — RECALCULÉ À CHAQUE FRAPPE ET À CHAQUE RÉGLAGE.
   *
   * ── POURQUOI UN MEMO ET PAS UNE VÉRIFICATION AU CLIC ──────────────────────
   * Ses trois entrées sont à l'écran, au-dessus du champ: la FENÊTRE, les
   * BOUCHES et leurs absences. Un plancher qui ne se recalculerait qu'au clic
   * dirait « il faut au moins 74 » à quelqu'un qui vient de passer de sept
   * jours à trois — c'est-à-dire un refus contre un état que l'écran ne montre
   * plus. Il bouge avec ce qui le fabrique.
   *
   * ⚠️ `household === null` REND `unbounded`, DONC AUCUN REFUS. C'est l'état du
   * montage, et c'est la bonne direction: tant qu'on ne sait pas qui mange, on
   * ne peut refuser aucun montant.
   */
  const budgetVerdict = React.useMemo(() => {
    const typed = budget.trim();
    const amount = Number(typed);
    return assessBudget({
      amount: typed === "" || !Number.isFinite(amount) ? null : amount,
      market: budgetMarket,
      mouths: budgetMouthsFor({
        dayTokens: askedDays.tokens,
        // ⚠️ LE MÊME REPLI QUE LA GRILLE DE PRÉSENCE, deux cents lignes plus
        // bas: `member.eatingSlots ?? (props.rhythm ?? [])`. Une bouche sans
        // rythme déclaré mange aux moments de la maison, et ce sont ceux de la
        // personne qui compose.
        houseSlots: props.rhythm ?? [],
        mouths: (household?.members ?? []).map((m) => ({
          memberId: m.memberId,
          diet: m.diet,
          eatingSlots: m.eatingSlots,
          // ⚠️ LA COLONNE DU FOYER SEULE. L'union est faite par
          // `budgetMouthsFor`, et SEULEMENT sur la ligne du titulaire: la
          // fondre ici la recopierait sur des bouches qui n'ont rien déclaré.
          away: m.awayHousehold,
        })),
        // ⚠️ `props.awayDays` EST LA DÉCLARATION DU TITULAIRE — la colonne que
        // la grille « Choisir les repas » écrit sous les dates, et que le
        // moteur unit à celle du foyer (`away.effective`). L'ignorer ferait un
        // plancher trop haut pour quelqu'un qui vient de dire qu'il s'absente.
        selfMemberId: household?.me?.memberId ?? null,
        selfAway: props.awayDays ?? [],
      }),
    });
  }, [budget, budgetMarket, askedDays, props.rhythm, props.awayDays, household]);

  async function build(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    // ⚠️ `Number("")` VAUT 0 ET EST FINI. Un test `!== null` laisserait donc
    // partir « budget: 0 » comme une consigne — le dépôt a déjà payé ce piège
    // sur une taille pré-remplie à 0 pour un compte neuf.
    const budgetAmount = Number(budget.trim());
    if (
      budget.trim() === "" || !Number.isFinite(budgetAmount) ||
      budgetAmount <= 0 || budgetAmount > BUDGET_MAX
    ) {
      setError(t("plan.cooking.budget_required"));
      return;
    }
    // ⛔ LE PLANCHER REFUSE ICI, ET IL DIT SON CHIFFRE. Un budget sous le
    // plancher n'est pas une panne: c'est une réponse qu'aucun panier ne peut
    // acheter, et le seul endroit où on peut la corriger est le champ qu'on
    // vient de quitter. Le serveur, lui, ne refuse pas — il cesse d'écrire un
    // plafond impossible et le NOMME sur la ligne.
    if (budgetVerdict.kind === "below_floor") {
      // ⛔ LE CLIC NE RÉPÈTE PAS LA PHRASE — il y EMMÈNE.
      //
      // Mesuré le 2026-09-11 sur un run réel: écrite ici ET sous le champ, la
      // même phrase s'affichait DEUX FOIS, ce qui se lit comme une panne. Et
      // écrite seulement ici, elle survivait à sa cause — elle disait encore
      // « il faut au moins 92,75 » devant un champ corrigé à 150.
      //
      // Le refus vit donc à UN endroit, celui où on peut le lever, et il est
      // vivant. Ce que le clic ajoute est le geste qui manquait: il rend la
      // main au champ, plutôt que de ne rien faire.
      document.getElementById("meals-budget")?.focus();
      return;
    }
    // ⛔ ET PLUS DE GARDE SUR LA DURÉE D'UNE SESSION. Elle réclamait un champ
    // qui n'existe plus: un refus dont on ne peut pas voir la cause est un
    // bouton mort, cicatrice mesurée trois fois sur l'écran de réglages. La
    // durée est DÉRIVÉE du style de cuisine côté moteur, et le style, lui, a
    // sa question juste au-dessus du budget.
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
      // LE MONTANT EST ÉCRIT AVANT DE PARTIR, et le générateur le relit dans
      // `practical_constraints` — la même route que le rythme et les jours de
      // cuisine. Un second chemin (le passer dans le corps de la requête)
      // ferait deux sources pour un seul chiffre, et c'est toujours celle que
      // l'écran ne montre pas qui gagne.
      await savePlanInputs(userId, {
        budgetAmount,
        // ⟳ 2026-09-03 — RÉÉCRITE À L'IDENTIQUE, jamais recalculée ici: la
        // question n'est plus posée sur cet écran, et `savePlanInputs` réécrit
        // la clé à chaque composition. Passer `null` effacerait la réponse d'un
        // compte d'avant P2; passer un nombre inventé ferait de cet écran une
        // seconde autorité sur une colonne que le moteur dérive.
        cookingTimeMin,
        // ⟳ P2 — DURABLES, donc écrites ici comme le budget. Le générateur les
        // relit dans `practical_constraints` et en dérive sessions, jours de
        // cuisine et budget de temps (`_shared/keel/cooking_plan.ts`).
        cookingStyle,
        groceryRuns,
      });

      // ══════════════════════════════════════════════════════════════════
      // ⟳ 2026-09-10 · LOT 7 — UN SEUL APPEL, ET PLUS AUCUNE BRANCHE.
      // ══════════════════════════════════════════════════════════════════
      //
      // `generateMeal` (la lane individuelle) a quitté cet écran avec le
      // routage. Ce qui suit vaut pour une bouche comme pour six: le serveur
      // résout le foyer, les présences et les règles de maison lui-même.

      // ⚠️ L'ENVIE PART AVANT LE PLAN, ET SUR L'ANCRE DU DÉPART CHOISI.
      // Après, elle serait écrite pour une semaine que le générateur a déjà
      // lue — donc absente du plan qu'on vient de composer, sans que rien ne
      // le dise. Voir `envyWeek`.
      const line = envy.trim();
      if (line) {
        // ⛔ LE RÉSULTAT EST LU, ET UN REFUS ARRÊTE TOUT. Il était IGNORÉ:
        // `keel_household_submit_envy` rend `{ok:false, reason}` — elle ne
        // lève pas — et un `no_household` ou un `not_owner` partait donc en
        // silence, après quoi le plan se composait SANS la phrase qu'on venait
        // d'écrire. Un champ visible dont le contenu disparaît sans un mot est
        // pire qu'un champ absent; le `catch` de cette fonction affiche le
        // motif à l'endroit du clic et rouvre le formulaire avec le texte.
        const wrote = await submitEnvy(envyWeek, line);
        if (!wrote.ok) throw new Error(wrote.reason || "plan_not_written");
      }
      const result = await generateHouseholdMeal({
        window: windowRequest.kind === "exact"
          ? {
            kind: "exact",
            startsOn: windowRequest.startsOn,
            durationDays: windowRequest.durationDays,
          }
          : { kind: "until_sunday" },
        intent,
        replaces: intent === "replace_current" ? target?.mealId ?? null : null,
        context,
        // ⛔ TOUJOURS `null` DEPUIS LE 2026-09-06 — la question est partie de
        // l'écran, le champ reste dans le transport. `null` est ce que rendait
        // sa réponse par défaut: le serveur le lit comme « rien n'a été
        // demandé » et son calcul gouverne seul. Le seul plafond de forme
        // encore posé vient du STYLE, côté serveur (`styleCappedShape`).
        cookingShape: null,
        // ⚠️ LA VALEUR DE L'ÉCRAN, TELLE QUELLE. La porte du congélateur est
        // tenue par le champ lui-même (il décoche quand elle se ferme) et,
        // pour de bon, par le serveur. La recopier ici en ferait une troisième
        // expression de la même règle.
        oneCookingSession,
        // ⛔ `null`, ET C'EST LE RETRAIT D'UNE QUESTION EN DOUBLE, PAS UNE
        // RÉGRESSION. L'envie de cet écran part par `submitEnvy` juste
        // au-dessus, sur la ligne de la semaine. Envoyer les deux mettrait la
        // même phrase deux fois dans la consigne — une fois comme ligne de la
        // semaine, une fois comme envie du moment.
        //
        // ⚠️ LE CANAL RESTE OUVERT ET TYPÉ (`preferences: string | null` dans
        // `api/household.ts`, trois lectures côté edge): ce qui change est ce
        // que CET écran y met, pas ce que le serveur sait lire.
        preferences: null,
      });
      // Un 200 qui dit `ok: false` n'est pas une panne de transport, et il ne
      // doit pas non plus atterrir comme un succès: il rejoint la même table
      // de refus que tout le reste.
      if (!result.ok) throw new Error("plan_not_written");
      await props.onHouseholdComposed?.();
      // On RELIT plutôt que de poser la réponse à la place du plan affiché: une
      // génération peut avoir TRONQUÉ l'autre plan, et seule une relecture rend
      // les deux fenêtres telles qu'elles sont maintenant en base.
      const loaded = await loadMealPlans(userId, browserLocalDate());
      setPlans({ current: loaded.current, next: loaded.next });
      setTab(
        result.mealId && loaded.next?.mealId === result.mealId ? "next" : "current",
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
    return <p className="text-sm text-ink-soft">{t("meals.loading")}</p>;
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
   * ⟳ 2026-09-10 · LOT 7 — `canCompose` FERME LE FORMULAIRE À UN SECONDAIRE.
   *
   * ⛔ ET CE N'EST PAS LE RETOUR DE L'ANCIENNE GARDE `householdOwner`. Celle-là
   * fermait au MAÎTRE, parce que ce constructeur lui écrivait alors un plan
   * personnel que son propre écran masquait. Le maître compose ici depuis le
   * 2026-08-13, et il continue. Ce qui ferme aujourd'hui, c'est le membre
   * SECONDAIRE: le moteur unique lui rend 403 `not_owner`, et huit champs qui
   * ne peuvent que refuser à la fin sont le bouton mort le plus cher de
   * l'écran.
   *
   * ⚠️ `!hasWeek` NE FORCE PLUS L'OUVERTURE POUR LUI. C'était l'autre moitié du
   * défaut: un secondaire sans plan de foyer lisible se voyait ouvrir le
   * formulaire d'office, sans même avoir cliqué.
   */
  const showForm = canCompose && (formOpen || !hasWeek);
  // AUJOURD'HUI, dans l'horloge du navigateur — la seule que cet écran ait, et
  // la même que celle qui calcule `week_start`.
  const today = browserLocalDate();
  /**
   * ── LES DEUX OUTILS DU PLAN AFFICHÉ, ET LA RANGÉE QUI LES PORTE ───────────
   *
   * Les conditions vivaient EN LIGNE dans le rendu, chacune sur son bouton.
   * Elles sont nommées ici parce qu'une troisième est arrivée — « y a-t-il
   * quelque chose à mettre sur cette rangée » — et qu'elle doit être la
   * DISJONCTION des deux autres, pas une quatrième règle. Deux expressions à
   * tenir d'accord, c'est une rangée vide le jour où l'une bouge.
   *
   * ⛔ `!building` SUR LES DEUX: pendant une génération, `result` décrit encore
   * les plats qu'on est en train de remplacer. Ouvrir la liste de courses de ce
   * plan-là, ce serait acheter pour un plan mort.
   */
  const showSessionsButton = hasWeek && !building &&
    (result?.cookingSessions.length ?? 0) > 0;
  const showShoppingButton = hasWeek && !building &&
    (result?.shoppingList.length ?? 0) > 0;
  const showPlanTools = showSessionsButton || showShoppingButton;

  return (
    <div className="space-y-8">
        {/* ⟳ 2026-09-10 · LOT 7 — CE QU'UN SECONDAIRE LIT À LA PLACE DU
            FORMULAIRE, ET SEULEMENT S'IL N'A RIEN D'AUTRE À LIRE.

            ⛔ SANS CETTE PHRASE, L'ÉCRAN EST VIDE. « Le formulaire a disparu »
            et « la page n'a pas chargé » se relisent exactement pareil —
            cicatrice payée sur les bulles d'extras, où le retrait se devinait.

            ⚠️ ELLE NE FAIT ATTENDRE PERSONNE. Aucune copie du produit ne dit
            « ton plan se prépare »: c'est faux, rien n'est en cours, et un
            écran vide qui promet fait guetter quelque chose qui ne viendra
            pas. Elle dit QUI compose, et où se lit sa part. */}
        {!canCompose && !hasWeek && (
          <p className="text-sm leading-6 text-ink-soft">
            {t("plan.draft.owner_composes")}
          </p>
        )}
        {/* ══════════════════════════════════════════════════════════════════
            ⛔ « QUELS MOMENTS JE MANGE CHEZ MOI » SURVIT À LA FERMETURE DU
            FORMULAIRE, ET C'EST OBLIGATOIRE.
            ══════════════════════════════════════════════════════════════════

            Ce bouton vit à l'intérieur du formulaire de composition, sous les
            deux dates. Fermer le formulaire à un membre secondaire (lot 7) le
            fermait avec — et c'est le SEUL endroit du produit où quelqu'un
            déclare SES propres absences: `practical_constraints.away_days` de
            son compte. Les deux grilles de `/app/household` sont celles du
            MAÎTRE (`setMemberAway`, refusée à tout autre membre).

            ⛔ LE DÉFAUT AURAIT ÉTÉ MUET: la colonne existe, le lecteur existe,
            et plus personne n'aurait eu de geste pour l'écrire — « port à
            `null` = champ incollectable », cicatrice mesurée de ce dépôt. Ce
            n'est pas un geste de composition: déclarer qu'on n'est pas là ne
            compose rien, ça dit à la maison de ne pas cuisiner pour soi.

            ⚠️ MÊME BOUTON, MÊME GRILLE, MÊME CLÉ. `MealPickerGrid` est monté en
            permanence plus bas: on n'ouvre pas une seconde grille, on rouvre
            celle-là. */}
        {!canCompose && props.onAwaySaved && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-xs font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
          >
            {mealCopy("meals.picker.open")}
            {awayInWindow > 0 && (
              <span className="ml-1 font-normal text-ink-soft">
                · {awayInWindow}
              </span>
            )}
          </button>
        )}
        {showForm && (
        <section>
          <SectionLabel>
            {!hasWeek
              ? t("meals.form.title")
              : formIntent === "prepare_next"
              ? t("meals.rebuild.prepare_next")
              : t("meals.rebuild.title")}
          </SectionLabel>
          <Card>
            {/* CE QUE ÇA COÛTE, DIT AVANT LE CLIC. Une génération remplace la
                semaine affichée: cet écran ne lit que la dernière ligne. Le
                découvrir après coup serait perdre un plan qu'on avait accepté. */}
            {hasWeek && formIntent === "replace_current" && !truncationWarning && (
              <p className="mb-4 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                {t("meals.rebuild.warning")}
              </p>
            )}
            {/* CE QUE ÇA RETIRE AU PLAN COURANT, dit avant le clic et chiffré.
                Il REMPLACE l'avertissement générique: deux bandeaux ambre
                empilés se lisent comme du bruit, et c'est celui-ci qui porte
                l'information coûteuse. */}
            {truncationWarning && (
              <p className="mb-4 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                {truncationWarning}
              </p>
            )}
            {/* ══════════════════════════════════════════════════════════════
                UNE COLONNE, ET C'EST CELLE DE L'ÉTAPE 3 — 2026-09-03.
                ══════════════════════════════════════════════════════════════

                Les champs vivaient dans un `grid sm:grid-cols-2`, hérité du
                temps où ils étaient huit. L'entonnoir, lui, empile ses
                questions (`space-y-4`) et ne met côte à côte que les deux
                dates, qui sont UNE question. Avec quatre champs de moins, deux
                colonnes ne rangeaient plus rien: elles cassaient seulement
                l'ordre de lecture que l'autre écran tient. */}
            <form className="space-y-4" onSubmit={(e) => void build(e)}>
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
              <Field label={t("meals.form.window_label")} htmlFor="meals-window">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label
                      htmlFor="meals-window"
                      className="block text-label font-semibold uppercase text-ink-soft"
                    >
                      {t("meals.form.window_from")}
                    </label>
                    <input
                      id="meals-window"
                      type="date"
                      // Pas de départ dans le PASSÉ: `isReportable`
                      // autoriserait sinon des coches rétroactives sur des
                      // jours qu'un plan précédent possédait.
                      min={browserLocalDate()}
                      // ⛔ IL Y AVAIT UN `max` ICI — `lastNameableStart`, le
                      // dimanche de la semaine en cours —, RETIRÉ LE
                      // 2026-09-06 avec la garde serveur qui le justifiait.
                      // La date de départ est libre; seul le passé reste
                      // borné, juste au-dessus. Le prompt ancre désormais la
                      // liste des jours sur la DATE d'ouverture de la fenêtre,
                      // donc il ne peut plus se contredire. Toute l'histoire,
                      // avec la mesure de 6,2 s facturées, est dans la tombe
                      // de `meal_plan_window.ts`.
                      value={startDraft}
                      onChange={(e) => {
                        const next = e.target.value;
                        setStartDraft(next);
                        if (isIsoDate(next)) setWindowStart(next);
                      }}
                      className={`${inputClass} mt-1 w-auto`}
                    />
                    {/* ⛔ LA PHRASE A ÉTÉ RETIRÉE — 2026-09-08, sur les DEUX
                        écrans en même temps parce qu'elle venait d'une seule
                        clé (`plan.window.start_bound`, supprimée). Elle
                        décrivait une borne que le champ applique déjà par son
                        `min`: le calendrier ne propose pas le passé, et une
                        aide qui explique un geste impossible est du bruit.
                        La borne reste, ici comme au serveur. */}
                  </div>
                  <div>
                    <label
                      htmlFor="meals-window-end"
                      className="block text-label font-semibold uppercase text-ink-soft"
                    >
                      {t("meals.form.window_to")}
                    </label>
                    <input
                      id="meals-window-end"
                      type="date"
                      min={windowStart}
                      max={addDays(windowStart, MAX_WINDOW_DAYS - 1)}
                      value={endDraft}
                      onChange={(e) => {
                        const next = e.target.value;
                        setEndDraft(next);
                        if (isIsoDate(next)) setWindowEnd(next);
                      }}
                      className={`${inputClass} mt-1 w-auto`}
                    />
                  </div>
                </div>
                {/* L'APERÇU DIT CE QUE LES DEUX DATES FONT — le nombre de
                    jours, qu'on ne compte plus soi-même. */}
                <p className="mt-1 text-xs text-ink-soft">{windowPreview}</p>
                {/* CHOISIR LES REPAS, PLUS LES JOURS. « Choose exactly »
                    servait à préciser une fenêtre; les deux dates le font
                    seules. Le geste qui manquait est plus fin: dans cette
                    fenêtre-là, quels MOMENTS je mange chez moi. */}
                {props.onAwaySaved && (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    // UN LIEN, DONC LA MARQUE (charte §2). `fig-700`/`paper` = 9,98:1.
                    className="mt-2 text-xs font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
                  >
                    {mealCopy("meals.picker.open")}
                    {awayInWindow > 0 && (
                      <span className="ml-1 font-normal text-ink-soft">
                        · {awayInWindow}
                      </span>
                    )}
                  </button>
                )}
              </Field>

              {/* ⛔ L'INVENTAIRE DE CUISINE EST REMONTÉ ICI LE 2026-09-03, ET
                  L'ORDRE EST LA GARDE.

                  Il vivait 178 lignes PLUS BAS, après « combien de courses ».
                  On acceptait donc « une seule course » avant de savoir s'il y a
                  un congélateur — et « une seule course » ne tient QUE par le
                  congélateur. La personne répondait, puis découvrait le refus
                  dans l'explication du plan, pour une question qui était sous
                  ses yeux.

                  ⚠️ ET IL PRÉCÈDE AUSSI « TOUT CUISINER EN UNE SEULE FOIS »,
                  qui est grisée sans congélateur et dont le refus renvoie mot
                  pour mot à « Avec quoi vous cuisinez ». Un refus posé
                  au-dessus de son remède se lit comme un bouton mort.

                  ⚠️ CE N'EST PAS COSMÉTIQUE: c'est le même ordre que
                  l'entonnoir, qui monte `KitchenEquipmentCard` AVANT la carte
                  « Ce plan-ci ». Il est mesuré sur le HTML RENDU, pas sur la
                  source. */}
              {/* ══════════════════════════════════════════════════════════
                  ⛔ L'INVENTAIRE DE CUISINE, COLLECTABLE ICI — ET C'EST LA
                  CONDITION POUR QUE LA CASE DU DESSUS EXISTE VRAIMENT.
                  ══════════════════════════════════════════════════════════

                  Cette carte ne vivait QUE dans l'entonnoir (`/app/setup`,
                  étape « table »), qui n'a aucune entrée de nav. Quelqu'un qui
                  a un congélateur et n'a jamais vu la question lisait donc, sur
                  cet écran-ci, « il faut un congélateur » — sans le moindre
                  endroit atteignable pour le dire. C'est mot pour mot la
                  cicatrice « port à null = champ incollectable »: la porte
                  existe, la clé n'est nulle part.

                  ⚠️ REPLIÉE, ET C'EST SA NATURE. Un four ne change pas d'une
                  semaine à l'autre: la question se pose UNE fois, et déplier ne
                  sert qu'à celui qui a quelque chose à corriger. `<details>`
                  natif, pas un état React — il n'y a rien à se rappeler d'un
                  rendu à l'autre.

                  ⛔ ET C'EST LA MÊME CARTE, jamais une seconde: elle porte sa
                  garde de chargement (`practicalConstraints === null`), son
                  refus de sélection vide, et son écriture qui RELIT la colonne
                  avant de fusionner. Une rangée de pastilles réécrite ici
                  aurait perdu les trois. */}
              <details className="group rounded-card border border-line-strong bg-paper p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="text-label font-semibold uppercase text-ink-soft">
                    {t("setup.equipment.title")}
                  </span>
                  <ChevronDown
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="mt-4">
                  <KitchenEquipmentCard
                    embedded
                    practicalConstraints={planConstraints}
                    hasGoal={hasGoalRow}
                    // ⚠️ ON RELIT LA COLONNE, on ne devine pas ce qu'elle
                    // contient maintenant. La carte vient d'y écrire; recopier
                    // sa sélection dans l'état local d'ici ferait une seconde
                    // idée de ce que la cuisine possède, et c'est celle qu'on
                    // regarde le moins qui garderait l'ancienne.
                    onSaved={async () => {
                      if (!userId) return;
                      const fresh = await readPlanInputs(userId);
                      setPlanConstraints(fresh.practicalConstraints);
                      setHasGoalRow(fresh.hasGoal);
                    }}
                  />
                </div>
              </details>

              {/* ⛔ « POUR COMBIEN DE PERSONNES » A ÉTÉ RETIRÉ — 2026-09-03.
                  Il n'a jamais eu de sujet à plusieurs bouches (le générateur
                  du foyer DÉDUIT les couverts de la présence, repas par
                  repas), et l'entonnoir envoie `servings: 1` en dur sur ses
                  trois gestes. La grille de présence, juste en dessous, est la
                  question qui le remplace. */}

              {/* ── QUI EST LÀ, JOUR PAR JOUR — UNE LIGNE PAR BOUCHE ────────
                  ⚠️ C'EST LA MÊME GRILLE QUE PARTOUT AILLEURS, MONTÉE N FOIS.
                  Elle reprend les jours HORS fenêtre tels quels au `save`,
                  sinon marquer un week-end effacerait « jeudi midi ». Une
                  seconde implémentation « aurait fini par en effacer la
                  moitié ».

                  ⚠️ ET ON NE FUSIONNE JAMAIS `awayHousehold` AVEC `awaySelf`.
                  La grille RÉÉCRIT ce qu'on lui donne: nourrie de l'union, elle
                  recopierait la déclaration de la personne dans la colonne du
                  maître, où elle survivrait à sa rétractation. */}
              {household && (
                <Field
                  label={t("plan.request.presence_title")}
                  hint={t("plan.request.presence_intro")}
                >
                  <ul className="space-y-3">
                    {household.members.map((member) => (
                      <li
                        key={member.memberId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line-strong bg-fig-50/40 p-4"
                      >
                        <span className="text-base font-semibold text-ink">
                          {member.displayName}
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={pickerBusy}
                          onClick={() =>
                            setAwayFor(
                              awayFor === member.memberId ? null : member.memberId,
                            )}
                        >
                          {t("plan.request.presence_open")}
                        </Button>
                        {/* MONTÉE MÊME FERMÉE — `Modal` rend `null` sans
                            démonter — donc une grille modifiée survit à une
                            fermeture accidentelle. Même posture que sur les
                            deux autres écrans qui la montent.

                            ⚠️ `away={member.awayHousehold}` ET RIEN D'AUTRE:
                            l'union avec `awaySelf` ferait recopier la
                            déclaration de la personne dans la colonne du
                            maître, où elle survivrait à sa rétractation.

                            ⚠️ `eatingSlots === null` NE VEUT PAS DIRE « NE
                            MANGE JAMAIS »: il veut dire « aux moments de la
                            maison », le repli du produit. Passer `[]` rendrait
                            une grille SANS LIGNE — une bouche qu'on ne peut pas
                            marquer absente — et ça se lirait comme une panne.
                            On retombe donc sur le rythme de la personne qui
                            compose, qui est celui de la maison.

                            ⚠️ PLUS DE `size: null` FABRIQUÉ ICI: le roster rend
                            la taille depuis le 2026-08-14, et la grille la
                            reçoit telle quelle. Le `as EatingOccasionSlot[]`
                            qui l'accompagnait a disparu avec — un `as` sur un
                            type étranger désarme le typecheck, cicatrice
                            mesurée de ce dépôt. */}
                        <MealPickerGrid
                          open={awayFor === member.memberId}
                          onClose={() => setAwayFor(null)}
                          days={askedDays.tokens}
                          dates={askedDays.dates}
                          rhythm={member.eatingSlots ?? (props.rhythm ?? [])}
                          away={member.awayHousehold}
                          busy={pickerBusy}
                          onSave={async (next) => {
                            setPickerBusy(true);
                            try {
                              await setMemberAway(member.memberId, next);
                              setHousehold(await loadHousehold(userId));
                            } finally {
                              setPickerBusy(false);
                            }
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </Field>
              )}

              {/* ══════════════════════════════════════════════════════════
                  ⛔ « LES JOURS OÙ TU CUISINES » A ÉTÉ RETIRÉ — 2026-09-01
                  ══════════════════════════════════════════════════════════

                  Décision produit, prise en connaissance de cause: le plan ne
                  demande plus quels jours on cuisine. Il n'en restait qu'une
                  question utile — COMBIEN DE FOIS on cuisine — et elle est
                  posée plus bas, sous le sélecteur de style: « tout cuisiner en
                  une seule fois » (« je cuisine la veille » a disparu le
                  2026-09-03, le serveur la dérive).

                  ⚠️ CE QUE ÇA CHANGE POUR LE MOTEUR, ET C'EST VOULU:
                  `practical_constraints.cook_days` est désormais ÉCRIT VIDE par
                  `savePlanInputs`. La branche `declared.length === 0` de
                  `cookDayLines` prend alors la main — le modèle pose ses
                  sessions lui-même, au plus tôt. Laisser l'ancienne valeur en
                  base aurait fait pire que la retirer: une contrainte qui
                  décide encore des plans et que plus aucun écran ne peut
                  changer. */}

              {/* ⟳ P2 (2026-09-03) — LES DEUX MÊMES COMPOSANTS QUE
                  L'ENTONNOIR, et c'est le point: deux champs écrits séparément
                  divergeraient au premier libellé retouché, et c'est celui
                  qu'on regarde le moins qui garderait l'ancien mot.

                  ⚠️ L'ORDRE COMPTE, ET IL EST L'INVERSE DE L'ÉVIDENCE. Le
                  style d'abord, la cadence de courses ensuite: c'est le style
                  qui PLAFONNE le nombre de sessions, donc lire « trois
                  courses » avant de savoir qu'on cuisine le moins possible
                  ferait attendre trois séances que le plan ne fera pas. */}

              {/* ══════════════════════════════════════════════════════════
                  DEUX COLONNES, PARCE QUE C'EST UNE SEULE QUESTION —
                  2026-09-07.
                  ══════════════════════════════════════════════════════════

                  La règle de cet écran ne change pas: il EMPILE ses questions,
                  et ne met côte à côte que ce qui n'en fait qu'une — c'est
                  déjà pourquoi les deux dates partagent une ligne. Le style et
                  « une seule fois » sont exactement ce cas: l'aide du sélecteur
                  annonce « le nombre de fois où le plan vous demande de
                  cuisiner » (`plan.cooking.style_hint`), et la case en est le
                  cas extrême. Empilés, les deux blocs se lisaient comme deux
                  réglages; sur une ligne, la case se lit comme la précision du
                  champ qu'elle borde.

                  ⛔ L'ORDRE DU DOM NE BOUGE PAS, et c'est ce qui rend ce
                  changement gratuit pour le reste: le style est le PREMIER
                  enfant de la grille, donc la colonne de gauche. Pas d'`order-*`,
                  pas de `grid-flow-*-dense`, pas de `*-reverse` ici — ils
                  feraient mentir `oneCookingSessionField.int.test.ts`, qui lit
                  la SOURCE pour affirmer l'ordre de lecture, et qui vérifie
                  maintenant leur absence dans cette enveloppe.

                  ⚠️ `sm:` ET PAS `lg:`. Sous 640 px la case retombe SOUS le
                  sélecteur: deux colonnes de texte à 150 px ne rangent rien.
                  Et `sm:items-center`, pas le haut — le bloc de la case est le
                  plus court des deux, et calé en haut il flottait à côté d'une
                  ÉTIQUETTE en capitales, pas à côté du contrôle qu'il précise. */}
              <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
                <CookingStyleField
                  id="meals-cooking-style"
                  value={cookingStyle}
                  onChange={setCookingStyle}
                  disabled={building}
                />

                {/* ══════════════════════════════════════════════════════════
                  « TOUT CUISINER EN UNE SEULE FOIS » — À DROITE DU SÉLECTEUR
                  QU'ELLE PRÉCISE, ET EN PLUS PETIT.
                  ══════════════════════════════════════════════════════════

                  ⟳ 2026-09-04 — TROISIÈME PLACE EN QUATRE JOURS, et celle-ci
                  a un motif que les deux autres n'avaient pas: la case ne
                  répond pas à une question de calendrier ni à une question de
                  courses, elle précise LE SÉLECTEUR QU'ELLE BORDE. L'aide du
                  style annonce « le nombre de fois où le plan vous demande de
                  cuisiner » (`plan.cooking.style_hint`); cette case en est le
                  cas extrême. (⟳ 2026-09-07: la même paire, sur une ligne au
                  lieu de deux — voir l'enveloppe juste au-dessus.)

                  ⛔ AVANT « COMBIEN DE COURSES », toujours. Une seule course
                  IMPLIQUE la session unique — les deux entrent par la même
                  porte côté moteur (`generate-household-meal-v1`: `askedOne ||
                  groceryRuns === 1`) —, donc la cadence de courses se lit
                  APRÈS avoir dit si la cuisine tient en une fois.

                  ⚠️ ET C'EST L'ORDRE DE L'ÉTAPE 3, qui fait foi. Deux écrans
                  qui posent les mêmes questions dans deux ordres se relisent
                  comme deux formulaires; `oneCookingSessionField.int.test.ts`
                  lit les deux sources et refuse l'écart. */}
                <OneCookingSessionField
                  id="meals-one-cooking-session"
                  value={oneCookingSession}
                  onChange={setOneCookingSession}
                  disabled={building}
                  hasFreezer={hasFreezer}
                />
              </div>

              {/* ⟳ 2026-09-04 — LES MÊMES TROIS ENTRÉES QUE DANS L'ENTONNOIR,
                  lues aux mêmes endroits: le style juste au-dessus, la case
                  « une seule fois » entre les deux, et la fenêtre demandée en
                  haut du formulaire. Une seule qui manquerait ferait proposer
                  ici une cadence que l'étape 3 refuse — deux écrans, deux
                  offres, et c'est celui qu'on regarde le moins qui garderait
                  l'ancienne. */}
              <GroceryRunsField
                id="meals-grocery-runs"
                value={groceryRuns}
                onChange={setGroceryRuns}
                disabled={building}
                style={cookingStyle}
                oneCookingSession={oneCookingSession}
                daysToEat={askedDays.tokens.length}
              />

              {/* ⛔ « TEMPS PAR SESSION DE CUISINE » A ÉTÉ RETIRÉ — 2026-09-03.
                  Six pastilles de durée (30 min → 3 h) vivaient ici. P2 les a
                  retirées de l'entonnoir le matin même — « personne ne sait
                  répondre 45 avant d'avoir vu le plan » — et les a remplacées
                  par les deux questions ci-dessus, dont `cooking_time_min` est
                  maintenant DÉRIVÉ (`_shared/keel/cooking_plan.ts`). Les
                  laisser ici aurait fait DEUX autorités sur une colonne, dont
                  celle que l'entonnoir contredit à la composition suivante.

                  ⚠️ LA VALEUR N'EST PAS EFFACÉE POUR AUTANT: `cookingTimeMin`
                  fait l'aller-retour dans `savePlanInputs`. Voir son état. */}

              {/* LE BUDGET, APRÈS LA CUISINE ET AVANT L'ENVIE — l'ordre de
                  l'étape 3, au champ près. */}
              <Field
                label={t("plan.cooking.budget_label")}
                hint={t("plan.cooking.budget_hint")}
                htmlFor="meals-budget"
              >
                <input
                  id="meals-budget"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={BUDGET_MAX}
                  step="1"
                  className={inputClass}
                  value={budget}
                  onChange={(e) => {
                    setBudget(e.target.value);
                    // ⚠️ LE REFUS DU CLIC MEURT AVEC LA VALEUR QUI L'A CAUSÉ.
                    // `error` n'est remis à `null` qu'à l'envoi suivant: sans
                    // cette ligne, le refus du plancher restait au pied du
                    // formulaire pendant toute la correction.
                    setError(null);
                  }}
                />
                {/* ⛔ CE QUI SE DIT, ET CE QUI SE REFUSE, NE SONT PAS AU MÊME
                    ENDROIT. Le refus (« il faut au moins X ») part dans
                    `error`, au pied du formulaire, parce qu'il arrête l'envoi.
                    Ceci-ci n'arrête rien: c'est ce que ce budget va CHANGER,
                    et ça se lit sous le champ qui l'a produit, pendant qu'on
                    tape. Le mettre dans `error` ferait ressembler une
                    information à un blocage. */}
                {budgetVerdict.kind === "tight" && (
                  <p className="mt-1 text-xs text-ink-soft">
                    {t("plan.cooking.budget_tight")}
                  </p>
                )}
                {/* ⛔ LE REFUS SE REND ICI AUSSI, ET VIVANT — mesuré le
                    2026-09-11 sur un run réel: rendu SEULEMENT au clic, il
                    restait affiché pendant qu'on corrigeait le montant, et
                    disait encore « il faut au moins 92,75 » devant un champ
                    à 150. Un refus qui survit à sa cause est un refus faux.
                    Il est donc calculé, comme la phrase du dessus, à partir
                    de ce que le champ porte MAINTENANT. */}
                {budgetVerdict.kind === "below_floor" && (
                  <p className="mt-1 text-xs font-medium text-red-700">
                    {t("plan.cooking.budget_below_floor").replace(
                      "{amount}",
                      formatBudgetAmount(budgetVerdict.floor),
                    )}
                  </p>
                )}
              </Field>

              {/* ── ⛔ ICI SE TENAIT « COMMENT TU CUISINES CETTE SEMAINE » —
                  RETIRÉ LE 2026-09-06, sur le même geste que dans l'entonnoir
                  et pour la même raison: il se lisait comme un doublon de
                  « Comment voulez-vous cuisiner ? », rendu juste au-dessus.
                  Les deux écrans montaient le MÊME champ; en retirer un seul
                  aurait fait diverger les deux couloirs de composition. Le
                  détail de ce que ça coûte est dans `SetupPage.tsx`, à la même
                  place. */}

              {/* ══════════════════════════════════════════════════════════
                  L'ENVIE — UNE SEULE QUESTION, DEUX DESTINATIONS.
                  ══════════════════════════════════════════════════════════

                  ⛔ IL Y EN AVAIT DEUX, ET C'EST LE DÉFAUT QUE CE LOT FERME.
                  Un maître de foyer lisait ici « Ce dont tu as envie cette
                  fois » PUIS « C'est la maison a envie de quoi ? » — deux zones
                  de texte qui posent la même question, à deux endroits du même
                  formulaire, avec deux mots différents. L'étape 3 n'en pose
                  qu'une; c'est elle qui fait foi.

                  ⚠️ LES MOTS SONT CEUX DE L'ENTONNOIR (`plan.envy.*`), et le
                  titre n'est PAS du français canonique: c'est la phrase de
                  l'utilisateur, mot pour mot, et la corriger est une décision
                  humaine (voir la note d'`fr.ts`).

                  ⟳ 2026-09-10 · LOT 7 — UNE QUESTION, UN SEUL CANAL.
                  La destination « suivait la lane »: la ligne de la semaine
                  (`household_envy_submissions`, `submitEnvy`) pour un maître,
                  le corps de la requête (`preferences`) pour un solo. Il n'y a
                  plus qu'un moteur, donc plus qu'un canal — la ligne de la
                  semaine, qui est déjà celle de l'entonnoir. Envoyer les deux
                  mettrait la même phrase deux fois dans la consigne.

                  ⛔ ET LA LÉGENDE « repris de la dernière fois » EST PARTIE
                  AVEC `preferences`. Elle disait d'où venait un texte relu du
                  DERNIER PLAN; la ligne de la semaine n'est pas reprise, elle
                  est RELUE sur la semaine visée (`loadEnvyLine`, ancrée par
                  `envyWeek`) — et elle change quand on corrige la date de
                  départ. Il n'y a donc plus rien à prévenir: ce qui s'affiche
                  décrit toujours la semaine qu'on regarde. */}
              <Field
                label={t("plan.envy.title")}
                htmlFor="meals-envy"
              >
                <textarea
                  id="meals-envy"
                  className={`${inputClass} min-h-16`}
                  value={envy}
                  // LE PLAFOND DE LA COLONNE DU FOYER, et il s'applique
                  // maintenant à tout le monde: c'est la seule colonne où cette
                  // phrase atterrit.
                  maxLength={ENVY_MAX_CHARS}
                  placeholder={t("plan.envy.placeholder")}
                  onChange={(e) => setEnvy(e.target.value)}
                />
              </Field>

              {/* ⛔ « CE QUI SE PASSE CETTE SEMAINE » A ÉTÉ RETIRÉ — 2026-09-03.
                  Le champ disait ce que la grille de présence ne peut pas dire
                  (« des invités samedi », « le four est en panne »), et il
                  n'existe pas à l'étape 3, qui envoie `context: null` sur ses
                  trois gestes. Décision produit, prise à l'écran: l'entonnoir
                  fait foi. La question ouverte de FF-003 — LIRE cette prose
                  plutôt que la supprimer — reste ouverte, et la colonne reste. */}

              {error && <p className="text-sm text-red-700">{error}</p>}

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="primary" disabled={building}>
                  {building ? t("meals.form.building") : t("meals.form.submit")}
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
                    {t("meals.form.cancel")}
                  </Button>
                )}
              </div>
            </form>
          </Card>
        </section>
        )}

        <section>
          {/* ══════════════════════════════════════════════════════════════════
              RANGÉE 1 — QUEL PLAN, ET COMMENT EN FAIRE UN AUTRE.

              ⟳ 2026-09-09 — LES QUATRE BOUTONS ÉTAIENT SUR UNE SEULE RANGÉE, ET
              ILS NE PARLAIENT PAS DE LA MÊME CHOSE. « Tes sessions de cuisine »
              et « Liste de courses » ouvrent le plan QU'ON REGARDE; « Préparer
              le plan suivant » et « Composer un autre plan » en FABRIQUENT un
              autre — l'un remplace même celui qui est à l'écran. Quatre boutons
              de même forme, côte à côte, annoncent quatre gestes de même
              nature: il fallait lire les libellés pour découvrir que deux
              d'entre eux jettent ce qu'on est en train de lire.

              Les deux gestes de PLAN montent donc ici, sur la rangée qui porte
              déjà le choix du plan. Demandé en ces termes: *« il faudrait que ce
              soit au-dessus, de manière à pouvoir sélectionner le plan — parce
              que forcément quand il y a le plan suivant qui est préparé il faut
              pouvoir le sélectionner clairement »*.

              ⚠️ ET LE TITRE DE SECTION RESTE, MÊME QUAND LES ONGLETS SONT LÀ.
              Il s'effaçait devant eux, parce que la rangée était pleine; elle
              ne l'est plus. Une section sans titre dès qu'un second plan existe,
              c'est le titre qui disparaît au moment où l'écran devient plus
              difficile à lire.
              ═══════════════════════════════════════════════════════════════ */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <SectionLabel className="mb-0">
                {t("meals.result.title")}
              </SectionLabel>
              {/* DEUX ONGLETS DÈS QU'UN SECOND PLAN EXISTE. Pas de primitive
                  `Tabs` dans le dépôt, et deux entrées n'en justifient pas une:
                  deux boutons en contrôle segmenté portent la même information
                  avec `aria-pressed`.
                  ⚠️ `role="group"` AVEC UN NOM: sans lui, un lecteur d'écran
                  annonce « Cette semaine, bouton, pressé » sans jamais dire de
                  quoi c'est le choix — deux boutons voisins ne forment pas un
                  sélecteur, c'est le groupe nommé qui le dit. */}
              {plans.next && (
                <div
                  className="flex flex-wrap items-center gap-2"
                  role="group"
                  aria-label={t("meals.result.plan_switch")}
                >
                  <Button
                    size="sm"
                    variant={tab === "current" ? "primary" : "secondary"}
                    aria-pressed={tab === "current"}
                    onClick={() => setTab("current")}
                  >
                    {t("meals.result.tab_current")}
                  </Button>
                  <Button
                    size="sm"
                    variant={tab === "next" ? "primary" : "secondary"}
                    aria-pressed={tab === "next"}
                    onClick={() => setTab("next")}
                  >
                    {t("meals.result.tab_next")}
                  </Button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* PRÉPARER LA SUITE. N'apparaît que s'il n'y a pas déjà un plan
                  suivant: au plus deux plans vivants, et la contrainte
                  d'exclusion le refuserait de toute façon. */}
              {hasWeek && canCompose && !showForm && !plans.next && (
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
                  {t("meals.rebuild.prepare_next")}
                </Button>
              )}
              {/* Il ne s'affiche pas quand le formulaire est déjà ouvert (il
                  ouvrirait ce qui est ouvert) ni quand il n'y a pas de semaine
                  (il n'y a pas d'« autre »). */}
              {/* ⚠️ IL S'AFFICHE POUR LE MAÎTRE, ET PAS POUR UN SECONDAIRE.
                  Le maître l'a récupéré le 2026-08-13 (le geste aboutit, il
                  écrit une ligne `household`); le secondaire le perd le
                  2026-09-10 — le moteur unique lui rend 403 `not_owner`, et
                  « refaire la semaine » ne peut alors que refuser. */}
              {hasWeek && canCompose && !showForm && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={building}
                  onClick={() => {
                    setFormIntent("replace_current");
                    setFormOpen(true);
                  }}
                >
                  {building ? t("meals.form.building") : t("meals.rebuild.button")}
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
                dishes={result?.dishes ?? []}
                shoppingList={result?.shoppingList ?? []}
                // ── LOT 4 · LES PRÉNOMS DES BOÎTES ─────────────────────────
                // LA MÊME EXPRESSION que celle passée à `PlanResult` plus bas,
                // et ce n'est pas une coquetterie: la table de pesée s'affiche
                // dans les DEUX surfaces (cette fenêtre et le bloc session du
                // jour), et deux règles de visibilité pour la même donnée
                // finiraient par diverger. La garde `isOwner` est celle-là
                // même — « la part d'un autre » est ce que `MyShareCard`
                // interdit à un secondaire.
                portions={place?.isOwner === true ? (result?.memberPortions ?? []) : []}
                open={sessionsOpen}
                onClose={() => setSessionsOpen(false)}
                // ⟳ 2026-09-04 — même règle que sur `PlanResult`: pas gardé par
                // `showing`, le serveur a tranché qui a droit à quoi.
                boxEnergy={energy.hasBoxEnergy ? ((id) => energy.forBox(id)) : undefined}
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
            <p className="mb-3 text-sm text-red-700">
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
                <p className="text-sm text-ink-soft">{t("meals.rebuild.building")}</p>
              </Card>
            )
            : groups.length === 0
            // ⚠️ CETTE PHRASE REDEVIENT VRAIE POUR LE MAÎTRE, ET ELLE DOIT
            // DONC LUI ÊTRE RENDUE. Elle dit « dis-moi par où commencer
            // CI-DESSUS ». Elle lui était masquée parce qu'il n'avait pas de
            // formulaire au-dessus — il en a un maintenant. La garde devait
            // tomber DANS LE MÊME COMMIT que la constante: la laisser aurait
            // rendu au maître un écran totalement vide.
            ? (
              <Card tone="dashed">
                <p className="text-sm text-ink-soft">{t("meals.result.empty")}</p>
              </Card>
            )
            : (
              <PlanResult
                // ══════════════════════════════════════════════════════════
                // LES DEUX OUTILS DU PLAN AFFICHÉ — RENDUS SOUS LE RAIL.
                //
                // ⟳ 2026-09-09 — ils vivaient dans une rangée à eux, au-dessus
                // du rail des jours. On lisait donc « Liste de courses » avant
                // de savoir de quels jours il s'agissait, et le rail — le
                // contrôle le plus utilisé de l'écran — descendait d'une
                // rangée. `PlanResult` les rend maintenant juste en dessous.
                //
                // ⛔ LA DÉCISION DE LES MONTRER RESTE ICI, et elle ne descend
                // pas avec eux: c'est cet écran qui sait s'il y a des sessions
                // à ouvrir et si une génération est en cours. Une fente qui
                // rendrait `null` quand il n'y a rien évite l'autre défaut —
                // une gouttière vide sous le rail, qui se lit comme un bloc
                // qui n'a pas fini de charger.
                tools={showPlanTools
                  ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {showSessionsButton && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSessionsOpen(true)}
                        >
                          {mealCopy("meals.sessions.title")}
                        </Button>
                      )}
                      {showShoppingButton && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setShoppingOpen(true)}
                        >
                          {t("meals.result.shopping_title")}
                        </Button>
                      )}
                    </div>
                  )
                  : null}
                // ⟳ A1 (2026-09-03) — LE TIMING, DIT PAR LE SERVEUR. Il vit
                // sur la ligne (`generated_from.timing`) et à la racine de la
                // réponse; l'écran le RÉPÈTE et ne le recalcule jamais — le
                // navigateur ne connaît pas l'heure.
                timing={result?.timing ?? null}
                dishes={result?.dishes ?? []}
                preparations={result?.preparations ?? []}
                cookingSessions={result?.cookingSessions ?? []}
                // LOT 1 — la vue jour dit les courses qui tombent chaque jour.
                // La donnée arrive déjà ici (la fenêtre de courses la lit);
                // le rendu du plan en déduit la vague de chaque jour.
                shoppingList={result?.shoppingList ?? []}
                // ── LOT 3 · LES PARTS DU PLAN QU'ON REGARDE ────────────────
                // Elles viennent de la MÊME LIGNE que ses plats (`result`), et
                // pas de `loadHouseholdMeal` qui ne rend que le plan COURANT:
                // sur l'onglet « suivant », les parts d'un autre plan se
                // seraient posées sous les plats de celui-ci sans que rien à
                // l'écran ne le dise.
                //
                // ⛔ ET LA GARDE EST ÉCRITE, pas seulement structurelle. Un
                // secondaire ne peut pas charger un plan de foyer ici
                // (`loadMealPlans` filtre `user_id`, et `generate-meal-v1`
                // n'écrit aucune `member_portions`) — mais « la part d'un
                // autre » est justement ce que `MyShareCard` interdit à un
                // secondaire, et une garde qu'on laisse au hasard d'une
                // requête n'est pas une garde.
                portions={place?.isOwner === true ? (result?.memberPortions ?? []) : []}
                startsOn={startDate}
                durationDays={durationDays}
                today={today}
                emptyLabel={t("meals.result.empty")}
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
                boxEnergy={energy.hasBoxEnergy ? ((id) => energy.forBox(id)) : undefined}
                dayEnergy={energy.showing ? ((day) => energy.forDay(day)) : undefined}
                // ⟳ 2026-09-04 — PAS gardé par `showing`: le kcal d'une boîte
                // à un nom sort aussi quand le LECTEUR est fermé par défaut
                // (maintenance, rien choisi). Le serveur a déjà tranché qui y a
                // droit; `forBox` ne fait que lire ce qui a voyagé.
              />
            )}
          {/* FF-059 LOT 3 · LA FOURCHETTE. Sous les plats, avec la note de
              base — jamais collée au total du jour: deux nombres alignés se
              soustraient tout seuls dans la tête de qui les lit, et cette
              soustraction est exactement ce qu'on ne construit pas. */}
          {energy.showing && (
            <div className="mt-3">
              <EnergyTargetNote target={energy.target} />
            </div>
          )}
          {/* ⟳ LOT 5 — LES DEUX INTERRUPTEURS, EXTRAITS. Ils vivaient en ligne
              ici, et c'était leur SEULE adresse du produit: quelqu'un qui avait
              éteint devait revenir sur un écran de plan et dérouler jusqu'en
              bas pour rallumer. `EnergySwitches` est maintenant rendu ici ET
              dans la fenêtre « À propos de toi » — une écriture, deux
              adresses. La règle d'affichage n'a PAS bougé d'un octet: elle vit
              dans le composant, et elle vient du serveur. */}
          <div className="mt-4">
            <EnergySwitches energy={energy} />
          </div>
          {/* Un plan de foyer à plusieurs bouches n'a pas de chiffre, et on dit
              pourquoi: la part de chacun est une PHRASE, pas un nombre. Le
              silence se lirait comme une panne. */}
          {energy.ready && energy.abstention === "household_portions_not_numeric" && (
            <p className="mt-3 text-xs text-ink-soft">
              {mealCopy("meals.energy.household_abstention")}
            </p>
          )}
        </section>

    </div>
  );
}
