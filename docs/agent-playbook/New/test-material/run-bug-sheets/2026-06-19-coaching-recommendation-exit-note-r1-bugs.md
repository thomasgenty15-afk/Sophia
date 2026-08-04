# Bug Sheet - Coaching Recommendation Exit Note R1

Run: `coachingrec-exit-note-20260619-r1`

## R1-B01

- Tours: 1
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation`
- Source amont: local dispatcher/reducer exit decision
- Symptome visible: Sophia repond via `normal_reply` apres un signal coaching high-confidence.
- Preuve systeme: `skill_run.status=exit`, `exit_target=global`, `route_reason=coaching_recommendation_exit_to_global`.
- Correction attendue: une recommandation coaching active ne doit pas sortir vers global sans off-topic, safety ou cloture explicite.
- Statut: open
- Fix reference: a faire
- Tests requis: signal `plan_action_coaching` + action concrete + feature recommendation -> `status=continue`, active state persiste.

## R1-B02

- Tours: 1
- Famille: BF-INTAKE-05 - Semantique composite aplatie
- Domaine owner: `coaching_recommendation`
- Source amont: mapping dispatcher/reducer recommendation
- Symptome visible: Sophia recommande carte d'attaque mais la note expose `current_recommendation=adjust_plan`.
- Preuve systeme: `priority_features=["attack_card"]`, `current_recommendation="adjust_plan"`, `candidate_features=[adjust_plan]`.
- Correction attendue: respecter la priorite `attack_card` pour `avoidance/launch_blocker` sauf preuve explicite d'action trop grosse/mal cadree; sinon clarifier.
- Statut: open
- Fix reference: a faire
- Tests requis: avoidance plan action ne doit pas etre override en adjust_plan sans mots explicites "trop gros/mal cadre/decouper".

## R1-B03

- Tours: 2
- Famille: BF-ROUTE-01 - Mauvais owner selectionne
- Domaine owner: active flow routing + `coaching_recommendation`
- Source amont: active state absent apres T1
- Symptome visible: suivi "ou preparer cette carte" route vers `product_help`.
- Preuve systeme: T2 `response_owner=product_help`, `route_reason=product_help_signal`.
- Correction attendue: conserver active flow coaching apres T1; le suivi de guidance reste dans le visible agent courant.
- Statut: open
- Fix reference: a faire
- Tests requis: T1 reco coaching, T2 "ou je la trouve/preparer" -> `response_owner=coaching_recommendation`.
