// Pack français — le namespace `deviation`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `deviation.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frDeviation = {
  // ── Déclarer un écart (planned_deviations) ───────────────────────────────
  // De plein droit, jamais un aveu.
  "deviation.title": "Déclarer un écart",
  "deviation.subtitle":
    "Un restaurant, un voyage, un repas de famille. Dis-le avant que ça arrive : le créneau sort du décompte au lieu de compter zéro. Ça fait partie du plan, ce n’est pas un échec.",
  "deviation.kind_label": "Ce qui arrive",
  "deviation.kind.restaurant": "Repas dehors",
  "deviation.kind.social": "Événement",
  "deviation.kind.travel": "Déplacement",
  "deviation.kind.family": "Repas de famille",
  "deviation.kind.work": "Contrainte de travail",
  "deviation.kind.other": "Autre chose",
  "deviation.when_label": "Quand",
  "deviation.when_today": "Aujourd’hui",
  "deviation.when_tomorrow": "Demain",
  "deviation.slot_label": "Quel créneau",
  "deviation.slot_all_day": "Toute la journée",
  "deviation.note_label": "Ce que ton coach devrait savoir",
  "deviation.note_placeholder":
    "Facultatif. Tes mots, gardés tels que tu les écris.",
  "deviation.submit": "Déclarer",
  "deviation.submitting": "Déclaration…",
  "deviation.declared": "Déclaré : {kind} le {date}.",
  "deviation.error":
    "L’enregistrement n’a pas abouti. Rien n’a été déclaré — réessaie.",
} satisfies TranslatedMessagesOf<"deviation">;
