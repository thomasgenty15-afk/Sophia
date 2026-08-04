# Bug Sheet - emotional-repair-local-doctrine-r5b

## Run

- Date: 2026-06-10
- Run id: `emotional-repair-local-doctrine-r5b`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-10-emotional-repair-local-doctrine-r5b.md`
- Verdict global: `red`

## Bugs

### R5B-B01

- Tours: 3
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: active flow state / normal reply persistence / conversation route persistence
- Source amont: persistance ou rechargement de `__active_skill_state` entre un tour local `emotional_repair` en `continue` et le tour utilisateur suivant.
- Symptôme visible: Sophia repond correctement a la question produit, mais sans transition doctrinale depuis `emotional_repair`.
- Preuve système: T2 route `active_emotional_repair_local_dispatcher`, `flow_action=provide_concrete_phrase`, `global_dispatcher_skipped=true`; T3 route `product_help` avec `active_flow_arbitration.reason_code=no_active_flow`, `operation_flow_run=null`, `note_information=null`; DB apres T3: `__active_skill_state.skill_id=product_help`, `previous_skill_id=null`, `product_help_note_information=null`.
- Correction attendue: apres tout `skillOutput.status=continue` de `emotional_repair`, persister et recharger `__active_skill_state.skill_id=emotional_repair` au tour suivant; un changement de sujet doit d'abord repasser par `emotional_repair.local_dispatcher`, qui doit produire `exit_to_global_dispatcher` + `note_information`.
- Statut: `verified`, vérifié par le run reel `emotional-repair-local-doctrine-r8`. La DB contient `emotional_repair` apres T2, et le T3 conserve maintenant `local_exit_source=emotional_repair`, `turn_note_source=emotional_repair`, `local_exit_consumed_by=global_dispatcher_second_pass`, puis `product_help.mode=inline`.
- Fix reference:
  - `supabase/functions/sophia-brain/router/operation_runtime_response_handler.ts`: garde-fou `ensureActiveConversationSkillStateBeforePersist` avant `updateUserState`, qui restaure l'active state pour les local flows conversationnels stateful en `status=continue`.
  - `supabase/functions/sophia-brain/router/operation_runtime_response_handler.ts`: trace `brain:active_conversation_skill_state_restored_before_persist` quand le runtime repare un `nextTempMemory` sans active state.
  - `supabase/functions/sophia-brain/router/operation_runtime_response_handler_test.ts`: tests de restauration `emotional_repair`, non-restauration sur `complete`, et non-overwrite d'un autre active state.
- Tests requis:
  - Integration locale `test-send-message`: T1 entree `emotional_repair`, T2 `provide_concrete_phrase`, assertion DB `__active_skill_state.skill_id=emotional_repair` apres T2.
  - T3 changement de sujet produit: attendu `active_emotional_repair_local_dispatcher` puis `exit_to_global_dispatcher` avec `note_information`.
  - Anti-faux-positif: `exit_to_global_dispatcher` doit continuer a nettoyer le flow sans appeler global sur le meme tour.
  - Safety: `safety_preempt` doit rester prioritaire et produire une `note_information` vers `safety_crisis`.
