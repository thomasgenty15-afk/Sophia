// Pack français — le namespace `tracking`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `tracking.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frTracking = {
  //
  // A7 — `/app/progress` DEVIENT LE SUIVI. Voir la note jumelle dans `en.ts`:
  // elle porte les retraits, les valeurs changées et la règle des six clés qui
  // écrivent un kcal.
  "tracking.permanent.label": "Ce qui a été fait",
  "tracking.permanent.plans_done_one": "{count} plan mené au bout",
  "tracking.permanent.plans_done_other": "{count} plans menés au bout",
  "tracking.permanent.plans_changed_one": "dont {count} que tu as modifié en route",
  "tracking.permanent.plans_changed_other":
    "dont {count} que tu as modifiés en route",
  "tracking.permanent.meals_decided_one": "{count} repas décidé pour toi",
  "tracking.permanent.meals_decided_other": "{count} repas décidés pour toi",
  "tracking.permanent.cooked": "cuisiné {sessions} fois, pour {meals} repas",
  "tracking.permanent.no_minutes":
    "Combien de minutes ça t'a fait gagner, personne ici ne l'a mesuré. Donc personne ici ne te le dit.",
  "tracking.permanent.leftovers_unknown":
    "Les boîtes restées ne sont pas encore comptées — et elles ne sont pas affichées à zéro pour autant.",
  "tracking.objective.label": "Ton objectif, jour par jour",
  "tracking.scope.day": "Aujourd'hui",
  "tracking.scope.week": "Ces sept jours",
  "tracking.scope.plan": "Ce plan",
  "tracking.total.plan_quantities":
    "{kcal} kcal, d'après les quantités écrites dans ton plan.",
  "tracking.total.declared_quantities":
    "{kcal} kcal, estimé - sa part la plus faible vient de quantités que tu as écrites toi-même.",
  "tracking.total.photo_estimate":
    "{kcal} kcal, estimé - une partie est lue sur des photos, et une photo tire vers le bas.",
  "tracking.total.slot_estimate":
    "{kcal} kcal, estimé - un repas ou plus n'a jamais été renseigné et tient sa place par une moyenne.",
  "tracking.total.assumed":
    "{kcal} kcal, estimé - les plats de ton plan dont tu n'as rien dit sont comptés comme mangés.",
  "tracking.total.empty": "Rien à additionner sur ce jour.",
  "tracking.total.abstained":
    "Pas de total : un plat n'a pas pu être pesé, et une somme partielle tirerait vers le bas.",
  "tracking.day.planned": "De ton plan",
  "tracking.day.photos": "Tes photos",
  "tracking.day.missed": "Rien de noté",
  "tracking.dish.ticked": "coché",
  "tracking.dish.silent": "rien dit",
  "tracking.dish.unticked": "pas mangé",
  "tracking.dish.off_plan": "autre chose",
  "tracking.energy.slot_estimate":
    "environ {kcal} kcal - une valeur de remplacement, et tu peux la changer dans la journée.",
  "tracking.missed.no_estimate":
    "Un repas de ce jour n'est rattaché à aucun moment : celui-ci reste donc sans chiffre.",
  "tracking.describe": "Décrire",
  "tracking.weight.label": "Ton poids",
  "tracking.weight.empty": "Aucune pesée sur cette fenêtre.",
  "tracking.weight.point": "{value} kg le {date}",
  "tracking.weight.period.1w": "1 sem",
  "tracking.weight.period.1m": "1 mois",
  "tracking.weight.period.3m": "3 mois",
  "tracking.weight.period.6m": "6 mois",
  "tracking.weight.period.12m": "12 mois",
  "tracking.weight.period.all": "Tout",
  "tracking.describe.title": "Décris ce repas",
  "tracking.describe.subtitle":
    "Avec tes mots. Si tu as pesé quelque chose, écris-le - personne ne te le demande.",
  "tracking.describe.placeholder":
    "Un bol de pâtes à la sauce tomate avec du fromage râpé",
  "tracking.describe.submit": "Enregistrer",
  "tracking.describe.submitting": "Enregistrement...",
  "tracking.describe.done":
    "Enregistré. Ce repas n'est plus compté comme oublié. Je n'ai pas su en tirer un chiffre - tes mots, eux, sont gardés.",
  "tracking.describe.done.estimated":
    "Enregistré - environ {kcal} kcal, lues dans tes mots. Ce repas n'est plus compté comme oublié.",
  "tracking.describe.error": "Ça n'a pas été enregistré - {message}",
  "tracking.describe.cancel": "Annuler",
} satisfies TranslatedMessagesOf<"tracking">;
