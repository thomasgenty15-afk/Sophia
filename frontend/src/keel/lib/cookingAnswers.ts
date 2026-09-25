import React from "react";

import {
  type CookingSessionCount,
  cookedMealsPerDay,
  offerableCookingSessions,
  offerableSessionTimes,
  type SessionTimeBound,
} from "../api/cookingPlan";
import { MAX_FRIDGE_DAYS } from "../api/groceryWaves";

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-25 — LES DEUX RÉPONSES DE CUISINE SONT-ELLES LANÇABLES ?
// ══════════════════════════════════════════════════════════════════════════
//
// « Combien de fois tu veux cuisiner » et « Temps par session de cuisine »
// retiennent le lancement du plan, sur les deux écrans (`/app/plan` et
// l'étape 3 de l'entonnoir). Les champs grisent déjà ce qui n'est pas
// proposable; ce module dit la même chose au bouton, avec LES MÊMES offres —
// celles du module serveur, jamais recopiées.
//
// ⚠️ UNE RÉPONSE GRISÉE N'EST PAS UNE RÉPONSE ABSENTE. Elle reste à l'écran
// (on n'efface pas ce que la personne a choisi), mais elle ne part pas: le
// moteur la relèverait, et le plan ne serait pas celui qu'on a cru demander.

/**
 * ⟳ 2026-09-25 — LA RÉPONSE PROPOSÉE LA PLUS PROCHE D'UNE RÉPONSE DEVENUE
 * IMPOSSIBLE (décision du propriétaire): les dates, les sessions ou le
 * congélateur changent, et ce qui était coché glisse au plus proche au lieu
 * de rester sélectionné et grisé. À égalité, la plus grande: plus de sessions,
 * de temps ou de courses ne rend jamais un plan infaisable.
 *
 * @param values les réponses proposées, JAMAIS vides (les offres du module
 *   serveur le garantissent).
 */
export function nearestOffered<T extends number>(values: readonly T[], value: number): T {
  if (values.length === 0) {
    throw new Error("[keel/cookingAnswers] nearestOffered: offre vide");
  }
  let best = values[0];
  for (const candidate of values) {
    const gap = Math.abs(candidate - value);
    const bestGap = Math.abs(best - value);
    if (gap < bestGap || (gap === bestGap && candidate > best)) best = candidate;
  }
  return best;
}

/**
 * ⟳ 2026-09-25 (soir) — CE QUE LA PERSONNE A CHOISI, PAS CE QUE L'ÉCRAN A
 * CORRIGÉ.
 *
 * ⛔ LE DÉFAUT, SUR LE BROUILLON `54aec009`: « 3 courses » choisies, « 2 »
 * enregistrées. En passant par « Deux fois » en cuisine, le champ Courses a
 * glissé de 3 à 2 (`nearestOffered`) — puis il est resté à 2 quand la
 * personne est revenue à « Trois fois », parce que la correction avait
 * remplacé sa réponse.
 *
 * La réponse choisie est donc gardée à part: elle change sur un geste de la
 * personne ou une valeur venue d'ailleurs (lecture de la base), jamais sur une
 * correction automatique. L'écran montre la réponse corrigée, qui revient à
 * la réponse choisie dès qu'elle redevient possible.
 *
 * PURE.
 */
export function intentAfter<A>(args: { value: A; wanted: A; auto: A | undefined }): A {
  return args.value !== args.auto && args.value !== args.wanted ? args.value : args.wanted;
}

/**
 * ⟳ 2026-09-25 (soir) — LE CÂBLAGE COMMUN DES TROIS CHAMPS DE CUISINE.
 *
 * @param correct la réponse à montrer, à partir de la réponse choisie (ou de
 *   la valeur actuelle quand rien n'a été choisi): la seule réponse possible,
 *   la plus proche proposée, ou `null` = rien à montrer.
 * @returns `shown`, la réponse à afficher et à envoyer; `pick`, le geste de la
 *   personne.
 */
export function useOfferedAnswer<A>(args: {
  value: A | null;
  onChange: (next: A | null) => void;
  correct: (intent: A | null) => A | null;
}): { shown: A | null; pick: (next: A | null) => void } {
  const { value, onChange, correct } = args;
  const [wanted, setWanted] = React.useState<A | null>(value);
  const [auto, setAuto] = React.useState<A | null | undefined>(undefined);
  const intent = intentAfter({ value, wanted, auto });
  // État dérivé pendant le rendu (motif React « ajuster l'état quand une prop
  // change »): lire un ref pendant le rendu est refusé par `react-hooks/refs`.
  if (intent !== wanted) setWanted(intent);
  const shown = correct(intent ?? value);
  React.useEffect(() => {
    if (shown !== null && shown !== value) {
      setAuto(shown);
      onChange(shown);
    }
  }, [shown, value, onChange]);
  const pick = React.useCallback((next: A | null) => {
    setWanted(next);
    setAuto(undefined);
    onChange(next);
  }, [onChange]);
  return { shown, pick };
}

/** Les déjeuners et dîners de la maison, lus sur les lignes de « Qui mange à la maison ». */
export function presenceMealsPerDay(
  rows: readonly { slots: readonly { slot: string }[] }[],
): number {
  return cookedMealsPerDay(rows.flatMap((row) => row.slots.map((s) => s.slot)));
}

export type CookingAnswerState = "ok" | "missing" | "unavailable";

export interface CookingAnswersVerdict {
  sessions: CookingAnswerState;
  time: CookingAnswerState;
}

export function cookingAnswersVerdict(args: {
  sessions: CookingSessionCount | null;
  sessionTime: SessionTimeBound | null;
  daysToEat: number;
  /** `hasFreezerDeclared`: « pas de congélateur » et « jamais demandé » valent `false`. */
  freezer: boolean;
  mealsPerDay: number;
}): CookingAnswersVerdict {
  const sessionsOffer = offerableCookingSessions({
    daysToEat: args.daysToEat,
    freezer: args.freezer,
    maxFridgeDays: MAX_FRIDGE_DAYS,
  });
  const sessions: CookingAnswerState = args.sessions === null
    ? "missing"
    : sessionsOffer.values.includes(args.sessions)
    ? "ok"
    : "unavailable";
  let time: CookingAnswerState;
  if (args.sessionTime === null) {
    time = "missing";
  } else if (args.sessions === null) {
    // Sans nombre de sessions, aucune plage n'est jugée: le champ n'en grise
    // aucune, et le refus du bouton porte sur les sessions.
    time = "ok";
  } else {
    const times = offerableSessionTimes({
      daysToEat: args.daysToEat,
      sessions: args.sessions,
      mealsPerDay: args.mealsPerDay,
    });
    time = times.values.includes(args.sessionTime) ? "ok" : "unavailable";
  }
  return { sessions, time };
}
