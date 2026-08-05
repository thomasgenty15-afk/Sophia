import React from "react";

import { localDateIn, dayTokenOf } from "../api/dates";
import { type GeneratedDish } from "../api/mealGeneration";
import { isReportable } from "../api/mealStretch";
import { loadMealTicks, mealTickKey, tickMeal, untickMeal } from "../api/mealTicks";
import { type DayToken } from "../api/types";

// COCHER UN REPAS — LA LIAISON, ÉCRITE UNE SEULE FOIS.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// Deux écrans montrent le même plat: `/app/plan` (« ma semaine ») et
// `/app/today` (« ce que je mange »). La case doit être la MÊME case — même
// clé, même écriture, même date. Deux liaisons parallèles auraient divergé sur
// la seule chose qui compte, et la divergence se serait vue comme une case
// cochée sur un écran et vide sur l'autre, sans qu'aucune des deux ne soit
// identifiable comme la menteuse.
//
// ── UNE COCHE EST DATÉE DU JOUR OÙ LE PLAT SE MANGE ───────────────────────
// Et c'est la décision qui tient tout le reste.
//
// Elle était datée de MAINTENANT, pour une raison qui était bonne: cocher lundi
// le dîner du vendredi écrirait un « j'ai mangé » daté de vendredi, dans la
// table même qui nourrit la couverture que le coach lit. Ce n'est pas une
// approximation, c'est une preuve fabriquée. Il en découlait qu'on ne cochait
// QUE les plats du jour.
//
// Le raisonnement était juste et la conclusion trop large. Ce qu'il faut
// interdire, c'est de dater un fait dans le FUTUR — pas de rapporter aujourd'hui
// ce qu'on a mangé hier. Un élève qui ouvre son plan le jeudi matin doit pouvoir
// cocher le dîner de mercredi: c'est un RAPPORT, et il est exact.
//
// L'autre raison était un vrai blocage, et elle ne l'est plus: « mardi de QUELLE
// semaine » n'avait pas de réponse dans les données (un plat nomme un jour,
// jamais une date; la table ne porte pas de `week_start`). Elle en a une
// maintenant — le moteur remplit sept jours à partir du jour de GÉNÉRATION, et
// `created_at` est cet ancrage. `api/mealStretch.ts` fait la résolution.
//
// ── CE QUI DÉCOULE: LE PASSÉ SE RATTRAPE, LE FUTUR RESTE FERMÉ ────────────
// La case existe sur les plats d'aujourd'hui et des jours ÉCOULÉS de la
// composition, et le fait porte la date du jour où le plat se mangeait. Elle
// n'existe pas sur les plats à venir, et l'absence est délibérée: on n'affiche
// pas une case grisée qui laisserait croire à une permission qu'on refuse.
//
// La fenêtre de rattrapage est donc bornée par la composition elle-même — six
// jours au plus, puisqu'elle en couvre sept.

/** Ce qu'un `DishCard` reçoit pour rendre sa case. */
export interface DishTick {
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
}

/** Aucune allocation par rendu: la liste vide est une constante. */
const NO_DISHES: readonly GeneratedDish[] = [];

/** La date locale du NAVIGATEUR — la même horloge que `currentMonday()`. */
export function browserLocalDate(): string {
  return localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

/** Le jour de la semaine, dans cette même horloge. */
export function browserDayToken(): DayToken {
  return dayTokenOf(browserLocalDate());
}

export interface MealTicks {
  /** Faux tant que les coches ne sont pas revenues de la base. */
  ready: boolean;
  /** Le motif du dernier échec d'écriture, à afficher près des plats. */
  error: string | null;
  /**
   * Les props de case pour ce plat, ou `null` s'il n'y en a pas à rendre —
   * plat absent du plan chargé, composition sans identité, séance non
   * authentifiée, ou plat À VENIR. Un `null` rend un `DishCard` strictement en
   * lecture.
   *
   * `onDate` est la date à laquelle CE plat se mange, résolue par l'appelant
   * (`api/mealStretch.ts`). C'est elle qui datera le fait, et c'est elle qui
   * décide si la case existe: le passé se rattrape, le futur non.
   */
  bind: (dish: GeneratedDish, onDate: string | null) => DishTick | null;
}

/**
 * Les coches d'une composition, chargées une fois et basculées à la demande.
 *
 * L'ÉTAT EST UN `Set` DE CLÉS, pas un booléen par plat: le même plat en lot est
 * rendu sous plusieurs jours, et c'est bien la POSITION dans le plan généré qui
 * décide de ce qui est coché, pas la carte qu'on regarde.
 */
export function useMealTicks(args: {
  userId: string;
  mealId: string | null;
  dishes: readonly GeneratedDish[];
}): MealTicks {
  const { userId, mealId } = args;
  const dishes = args.dishes.length > 0 ? args.dishes : NO_DISHES;

  const [ticked, setTicked] = React.useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) return;
      try {
        const ticks = await loadMealTicks(userId);
        if (!cancelled) setTicked(new Set(ticks.keys()));
      } catch {
        // Des coches illisibles laissent l'écran utilisable: on affiche tout
        // décoché plutôt que de refuser le plan. Le pire cas est une case à
        // recocher, pas un dîner invisible.
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // `mealId` est dans les dépendances parce qu'une REGÉNÉRATION change
    // l'identité de la composition: les clés de l'ancienne ne matchent plus
    // rien, et la semaine neuve doit repartir décochée.
  }, [userId, mealId]);

  const toggle = React.useCallback(
    async (index: number, key: string, dish: GeneratedDish, onDate: string) => {
      if (!mealId) return;
      setBusyKey(key);
      setError(null);
      try {
        if (ticked.has(key)) {
          await untickMeal({ userId, generatedMealId: mealId, dishIndex: index });
          setTicked((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        } else {
          await tickMeal({
            userId,
            generatedMealId: mealId,
            dishIndex: index,
            // LE JOUR OÙ LE PLAT SE MANGEAIT, pas celui où on tape. Voir
            // l'en-tête: un rattrapage est un rapport exact sur hier, et la
            // date qu'il porte doit être celle d'hier. `occurred_at` reste
            // l'instant de la tape, donc on n'efface pas la distinction entre
            // « quand c'est arrivé » et « quand ça a été rapporté ».
            localDate: onDate,
            slotKey: dish.slot,
            title: dish.title,
            contentLocale: "en-GB",
          });
          setTicked((prev) => new Set(prev).add(key));
        }
      } catch (e) {
        // L'ÉTAT N'EST PAS DÉPLACÉ AVANT L'ÉCRITURE. Une case qui bascule
        // d'abord et se corrige ensuite montre à l'élève un fait qui n'existe
        // pas; ici la case ne bouge que quand la ligne a bougé.
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyKey(null);
      }
    },
    [mealId, ticked, userId],
  );

  const bind = React.useCallback(
    (dish: GeneratedDish, onDate: string | null): DishTick | null => {
      if (!userId || !mealId) return null;
      // LE FUTUR N'EST PAS RAPPORTABLE, et c'est la seule interdiction qui
      // reste. Une date inconnue non plus: on ne saurait pas de quel jour on
      // parle, et écrire « aujourd'hui » par défaut daterait un fait au hasard.
      if (!isReportable(onDate, browserLocalDate())) return null;
      // L'INDEX DANS LE PLAN, et pas la position à l'écran. Le rendu regroupe
      // par jour et répète un plat en lot sur chaque jour qu'il couvre;
      // l'index d'affichage n'a donc aucun rapport avec l'identité du fait.
      const index = dishes.indexOf(dish);
      if (index < 0) return null;
      const key = mealTickKey(mealId, index);
      return {
        checked: ticked.has(key),
        busy: busyKey === key,
        onToggle: () => void toggle(index, key, dish, onDate!),
      };
    },
    [busyKey, dishes, mealId, ticked, toggle, userId],
  );

  return { ready, error, bind };
}
