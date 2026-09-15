# Bug Sheet - Coaching Recommendation No Safety Handoff R2

## Run

- Date: 2026-06-18
- Run id: `coachingrec-no-safety-handoff-20260618-r2`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-18-coaching-recommendation-no-safety-handoff-r2.md`
- Cadre: IA reelle locale, `/functions/v1/test-send-message`, `force_full_ai=true`

## Verification De Regression

### R2-V01

- Tours: 1
- Objet: faux handoff safety depuis `coaching_recommendation`
- Preuve: `http_status=200`, `response_owner=coaching_recommendation`, `skill_run.status=continue`, `safety=none`, aucun `target_dispatcher=safety_crisis`.
- Statut: `verified`
- Fix reference: suppression du chemin actif `safety_preempt` / `safety_transition` dans `coaching_recommendation`.

## Bugs

### R2-B01

- Tours: 3
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: router/runtime active flow
- Source amont: interaction entre `coaching_recommendation_exit_to_global`, final response owner et arbitration active.
- Symptome visible: reponse dans le sujet coaching, mais `response_owner=normal_reply`, `selected_handler=null`.
- Preuve systeme: route finale `response_owner=normal_reply`, `route_reason=coaching_recommendation_exit_to_global`; arbitration du meme tour indique `decision=continue_active`, `active_owner=coaching_recommendation`, `selected_owner=coaching_recommendation`; active state reste coaching.
- Correction attendue: quand arbitration continue l'active owner, le final owner doit rester `coaching_recommendation` sauf exit explicite valide qui ferme l'active state.
- Statut: `open`
- Fix reference: a faire
- Tests requis: integration avec active coaching + question comparative attack/adjust; assert final owner coaching et skill run present.

### R2-B02

- Tours: 3
- Famille: `BF-INTAKE-05` - Semantique composite aplatie
- Domaine owner: `coaching_recommendation`
- Source amont: mapping local dispatcher entre action floue et choix de feature.
- Symptome visible: le user dit ne pas savoir quelle decision demander a Camille, mais Sophia garde `attack_card` en priorite.
- Preuve systeme: signal `action_type=clarification`, `failure_mode=unclear`, `priority_features=["attack_card"]`; reponse visible "je partirais sur carte d'attaque d'abord".
- Correction attendue: si l'action n'est pas reliee a une action concrete du plan, ne pas recommander `attack_card`, `defense_card` ou `adjust_plan` comme feature produit; utiliser un coaching classique. `adjust_plan` est reserve aux actions de plan concretes mal calibrees.
- Statut: `fixed`
- Fix reference: `coaching_recommendation` reducer: features plan-bound (`attack_card`, `defense_card`, `adjust_plan`) routees vers `free_action_coaching` sans action concrete du plan; nouveau visible agent `free_action_coaching`; prompt local durci sur source `plan` + `plan_item_id`.
- Tests requis: `coaching routes plan-bound feature recommendation to free action coaching without concrete plan item`; `coaching uses free action coaching instead of adjust plan without concrete plan action`; `coaching refuses platform guidance for unbound action card question`.

### R2-B03

- Tours: 4
- Famille: `BF-LEDGER-02` - Commit reel mal rendu
- Domaine owner: final response pipeline / direct effect confirmation pipeline
- Source amont: composition de la confirmation `create_one_shot_reminder` avec le visible agent coaching.
- Symptome visible: confirmation de rappel rendue deux fois.
- Preuve systeme: `executed_tools=["create_one_shot_reminder"]`, `tool_execution=success`, un seul `scheduled_checkin`, mais deux phrases "C'est programmé..." dans la reponse.
- Correction attendue: confirmation unique du commit, puis reponse coaching restante.
- Statut: `open`
- Fix reference: a faire
- Tests requis: multi-intention rappel ponctuel + coaching avec checkin count = 1 et confirmation visible unique.
