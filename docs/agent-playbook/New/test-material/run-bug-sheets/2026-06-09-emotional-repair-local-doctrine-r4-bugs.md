# Bug Sheet - emotional-repair-local-doctrine-r4

## Run

- Date: 2026-06-09
- Run id: `emotional-repair-local-doctrine-r4`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-09-emotional-repair-local-doctrine-r4.md`
- Verdict global: `red` système, `green` sur les modifications prompt `emotional_repair`

## Bugs

### R4-B01

- Tours: 5
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: active flow policy / router + handoff local source
- Source amont: orchestration active-flow avant routage `product_help`
- Symptôme visible: réponse produit correcte, mais pas de preuve de transition doctrinale depuis `emotional_repair`.
- Preuve système: T4 active `__active_skill_state.skill_id=emotional_repair`; T5 route `product_help` avec `active_flow_arbitration.reason_code=no_active_flow`, `product_help_note_information=null`, `previous_skill_id=null`.
- Correction attendue: pendant un flow actif, le message de changement de sujet doit passer d'abord par le dispatcher local source pour produire `exit_to_global_dispatcher` + `note_information`, ou la purge transverse doit produire une note canonique équivalente.
- Statut: `fixed`, rouvert par le rerun reel `emotional-repair-local-doctrine-r5b` puis corrigé côté persistance; en attente de re-validation QA réelle.
- Fix reference:
  - `supabase/functions/sophia-brain/router/run.ts`: ne purge plus un flow conversationnel actif sur `conversation_risk.should_exit_flows`; trace `brain:conversation_risk_flow_exit_deferred_to_local`.
  - `supabase/functions/sophia-brain/router/normal_reply_persistence_pipeline.ts`: la purge post-réponse par `conversation_risk` est ignorée si un dispatcher conversationnel local est actif.
  - `supabase/functions/sophia-brain/router/conversation_route_runtime_support.ts`: une route `product_help` sans arbitrage local ne peut plus supprimer un flow conversationnel actif différent.
  - `supabase/functions/sophia-brain/router/run_test.ts`: tests unitaires du defer `conversation_risk` vers dispatcher local actif.
  - `supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`: test anti-régression `product_help` ne supprime pas `emotional_repair` actif sans arbitrage.
- Rerun reference: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-10-emotional-repair-local-doctrine-r5b.md` prouve que le fix ne couvre pas le chemin reel; T3 reste `product_help` standalone avec `note_information=null`.
- Fix complementaire: `supabase/functions/sophia-brain/router/operation_runtime_response_handler.ts` restaure l'active state des local flows conversationnels stateful en `status=continue` avant persistance.
- Tests requis: changement de sujet produit pendant `emotional_repair` actif, changement de sujet normal coaching, anti-faux-positif stop local sans global, safety preempt avec note, vérification trace `note_information`.
