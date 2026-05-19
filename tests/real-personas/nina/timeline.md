# Nina Timeline

## 2026-05-06 - Creation Du Profil

- user_id : `e5630c78-447e-452c-b7d6-e4b475cd22fd`
- email : `nina@gmail.com`
- profil : Nina, femme, 34 ans, objectif perte de poids.
- status : onboarding termine, trial actif.

## 2026-05-06 - Plan V2 Active

- cycle_id : `8db01557-6c1c-43bc-a2b9-31940eeeae20`
- transformation active : `Retrouver un poids de forme pour plus de confort au quotidien`
- plan actif : `Amorcer la perte de poids et retrouver du confort`
- phase active : `Reprendre le controle sur le grignotage`
- actions actives :
  - `Nettoyer ton environnement direct`
  - `Faire le choix du brut`

## Runs A Lancer

### Run 1 - QA Operations Routing

Objectif : tester la difference entre `prepare_attack_card`, `prepare_defense_card` et `adjust_plan_item` avec un vrai plan.

Scenarios utiles :

- Nina veut commencer le nettoyage des placards mais n'arrive pas a s'y mettre.
- Nina a faim/stress apres le travail et risque de prendre des biscuits comme d'habitude.
- Nina demande explicitement a changer une action parce qu'elle ne lui convient pas.
- Nina corrige Sophia quand la mauvaise action est ciblee.

Rapport attendu :

- `tests/real-personas/nina/runs/operations/<YYYY-MM-DD>-operations-<run-id>.md`

### Run 2 - WhatsApp Simulation

Objectif : apres validation du routing operations, tester la meme logique dans `/chat` avec le scope WhatsApp sim si necessaire.

Points a surveiller :

- ton naturel et respectueux sur le poids ;
- pas de conseil medical ou nutritionnel lourd ;
- grounding sur les deux items actifs ;
- consentement clair avant operations ;
- pas de modification plan pour un simple soir difficile.
