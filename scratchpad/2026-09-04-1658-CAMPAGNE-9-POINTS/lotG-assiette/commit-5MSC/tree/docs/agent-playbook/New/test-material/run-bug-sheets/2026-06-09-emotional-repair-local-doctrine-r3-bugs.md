# Bug Sheet - emotional-repair-local-doctrine-r3

## Run

- Date: 2026-06-09
- Run id: `emotional-repair-local-doctrine-r3`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-09-emotional-repair-local-doctrine-r3.md`
- Verdict global: `red`

## Bugs

### R3-B01

- Tours: 2, 3
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `emotional_repair`
- Source amont: dispatcher local + reducer local + `visible_task.conversation_context`
- Symptôme visible: Sophia répète une présence générique au lieu d'intégrer la contrainte "une phrase", puis ignore "on s'arrête là".
- Preuve système: T2/T3 route `active_emotional_repair_local_dispatcher`, global dispatcher bloqué, état `__active_skill_state.skill_id=emotional_repair` toujours `active` après le stop.
- Correction attendue: faire produire au dispatcher local des actions distinctes pour continuation contrainte, stop local et exit ; faire appliquer par le reducer la clôture d'état et une réponse locale courte pour `exit_to_global_dispatcher`.
- Statut: `verified`
- Fix reference: `supabase/functions/sophia-brain/skills/emotional_repair/local_flow.ts`, `supabase/functions/sophia-brain/skills/emotional_repair/local_flow_test.ts`
- Tests requis: positif stop local, paraphrase stop local, anti-faux-positif "reste avec moi", continuité contrainte "une phrase", test IA réel post-fix. Couverture actuelle: prompt dispatcher testé pour règles champ par champ, stop local et exactement deux exemples ; reducer stop local couvert ; run IA réel `emotional-repair-local-doctrine-r4` vérifie `provide_concrete_phrase` et `exit_to_global_dispatcher`.

### R3-B02

- Tours: 4
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: active flow policy + `emotional_repair` exit/handoff
- Source amont: transition entre flow actif `emotional_repair` et dispatcher cible `product_help`/global
- Symptôme visible: réponse produit correcte, mais absence de preuve de transition doctrinale depuis le flow actif.
- Preuve système: T4 route `product_help` avec `reason_code=skill_entry_signal`, `active_flow_arbitration.reason_code=no_active_flow`; state DB remplace l'actif par `product_help`, `previous_skill_id=null`, `product_help_note_information=null`.
- Correction attendue: imposer `exit_to_global_dispatcher` ou `handoff_to_local_flow` avec `note_information` exploitable quand le user change clairement de sujet pendant un flow local actif.
- Statut: `open`
- Fix reference: à renseigner après correction.
- Tests requis: changement de sujet produit pendant emotional repair, changement de sujet non-produit vers global, safety preempt séparé, vérification trace `note_information`, anti-faux-positif continuation émotionnelle.
