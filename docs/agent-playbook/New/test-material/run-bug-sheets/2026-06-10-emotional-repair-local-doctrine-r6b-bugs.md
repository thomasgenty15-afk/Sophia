# Bug Sheet - emotional-repair-local-doctrine-r6b

## Run

- Date: 2026-06-10
- Run id: `emotional-repair-local-doctrine-r6b`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-10-emotional-repair-local-doctrine-r6b.md`
- Verdict global: `red`

## Bugs

### R6B-B01

- Tours: 3
- Famille: `BF-ROUTE-02` - Active flow / interruption policy non respectee
- Domaine owner: active flow state loader / turn frame construction / route arbitration.
- Source amont: l'etat `user_chat_states.temp_memory.__active_skill_state` existe apres T2, mais n'est pas consomme comme active flow au debut de T3.
- Symptome visible: Sophia repond correctement a la question produit, mais sans sortie doctrinale depuis le dispatcher local `emotional_repair`.
- Preuve systeme: verification DB apres T2: `__active_skill_state.skill_id=emotional_repair`, `status=active`; T3 trace: `active_flow_arbitration.reason_code=no_active_flow`, `active_owner=none`, `route_reason=skill_entry_signal`; `product_help` diagnosis: `mode=standalone`, `active_flow_used=false`, `return_to_parent_flow=false`, `note_information=null`; DB apres T3: `__active_skill_state.skill_id=product_help`.
- Correction attendue: au debut de chaque tour, si `tempMemory.__active_skill_state` contient un local flow conversationnel actif, `activeFlowStateForTurn.activeSkillState` doit etre hydrate avant tout dispatcher global; le T3 doit passer par `emotional_repair.local_dispatcher`, produire `exit_to_global_dispatcher` avec `note_information`, puis seulement laisser `product_help` reprendre.
- Statut: `verified`, vérifié par le run reel `emotional-repair-local-doctrine-r8`.
- Fix reference:
  - `supabase/functions/sophia-brain/router/run.ts`: propagation transverse de `local_flow_exit_handoff` dans `turnFrame` et `routeDecision` du second passage global.
  - `supabase/functions/sophia-brain/router/recommendation_runtime_support.ts`: parent context synthetique pour `product_help` apres local flow exit.
  - Run reel `emotional-repair-local-doctrine-r8`: T3 `turn_note_source=emotional_repair`, `local_exit_source=emotional_repair`, `local_exit_consumed_by=global_dispatcher_second_pass`, `product_help.mode=inline`.
- Tests requis:
  - Integration locale `test-send-message`: T1 entree `emotional_repair`, T2 `status=continue`, assertion DB `__active_skill_state.skill_id=emotional_repair` apres T2.
  - Integration loader/arbitrator: T3 changement de sujet produit, attendu `active_flow_arbitration.active_owner=emotional_repair`, jamais `no_active_flow`.
  - Handoff: attendu `exit_to_global_dispatcher` avec `note_information.source_flow=emotional_repair`, puis `product_help` consomme sa propre note.
  - Anti-regression: `exit_to_global_dispatcher` ne doit pas appeler global sur le meme tour; `safety_preempt` doit conserver la priorite vers `safety_crisis`.
