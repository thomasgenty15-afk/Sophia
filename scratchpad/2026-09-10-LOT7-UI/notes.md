# Lot 7 — moitié frontend. Notes de session.

## Ce qui exige une décision/action côté fonction edge (NON FAIT ici)

1. `generate-household-meal-v1` ne lit AUCUN de `body.mode`, `body.meal_slot`,
   `body.servings`, `body.pantry` (grep sur `body\.` dans son index.ts).
   Sans effet côté écran : les TROIS sites de montage les posaient déjà en
   constantes (`"to_shop"`, `null`, `1`, `[]`) depuis le 2026-09-03, donc rien
   n'est perdu à la bascule. La « parité N = 1 » du lot 8 (garde-manger, repas
   isolé) ne peut donc PAS être prouvée par le front : elle est serveur.

2. `generate-meal-v1` n'a plus aucun client navigateur. Sa suppression reste
   à la session principale (garde `not_owner` + test en cours).

3. `keel_household_submit_envy` rend `{ok:false, reason:'no_household'}` pour un
   compte sans ligne `household_members`. Depuis ce lot, la ligne de la semaine
   est le SEUL canal d'envie : un tel compte verra donc un refus NOMMÉ au clic
   (au lieu de perdre sa phrase en silence, ce qui était le comportement avant).
   ⇒ dépend de l'ensure du lot 1. À vérifier avant mise en service.

## Vérifié, aucun chantier à ouvrir

- L'écran ne reconstruit pas la cible d'énergie : `mealEnergy.ts` appelle
  `meal-energy-v1`, qui appelle `loadDailyEnergyTarget`.
- `meal-energy-v1/index.ts:1033` renvoie l'objet `target` entier tel que
  `loadDailyEnergyTarget` le rend ⇒ `pace_unavailable` atteint bien le front.
- Anciens plans personnels : `cookedPlans` rend TOUT le reste quand aucun plan
  `household` n'est vivant. Un plan `plan_kind='personal'` reste donc lisible,
  et rien côté front ne réécrit `plan_kind`.
