# Bug Sheet - emotional-repair-local-doctrine-r7

## Run

- Date: 2026-06-11
- Run id: `emotional-repair-local-doctrine-r7`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-11-emotional-repair-local-doctrine-r7.md`
- Verdict global: `red`

## Bugs

### R7-B01

- Tours: 3
- Famille: `BF-ROUTE-02` - Active flow / interruption policy non respectee
- Domaine owner: `router/run.ts` active `emotional_repair` branch / local exit propagation / final route trace.
- Source amont: `emotional_repair` est charge depuis DB et lu par `readActiveFlowState`, puis l'active state est supprime avant `runConversationRouters`; la sortie locale n'est pas exposee comme `exit_to_global_dispatcher` ni comme `note_information` source `emotional_repair` dans la trace finale.
- Symptôme visible: Sophia repond correctement via `product_help`, mais la trace presente `product_help` en standalone et `active_flow_arbitration=no_active_flow`.
- Preuve systeme: T3 `active_flow_debug`: `user_state_loaded` raw `__active_skill_state.skill_id=emotional_repair`; `read_active_flow_state` active `emotional_repair`; `before_run_conversation_routers` raw active absent et `active_skill_state=null`; `after_run_conversation_routers` `route_active_flow_reason_code=no_active_flow`. Trace finale: `note_information.source_flow_id=global_dispatcher`, `target_dispatcher=product_help`; `product_help.mode=standalone`, `active_flow_used=false`.
- Correction attendue: quand un flow actif `emotional_repair` quitte vers global, le runtime doit conserver dans la trace finale et dans le contexte de second passage une `note_information` source `emotional_repair`, avec `exit_to_global_dispatcher` explicite et resume exploitable; `product_help` ne doit pas etre audite comme standalone.
- Statut: `verified`.
- Fix reference:
  - `supabase/functions/sophia-brain/router/run.ts`: propagation transverse de `local_flow_exit_handoff` dans `turnFrame` et `routeDecision` du second passage global; promotion de la `note_information` locale quand la note finale etait seulement `global_dispatcher`.
  - `supabase/functions/sophia-brain/router/recommendation_runtime_support.ts`: `product_help` recoit un parent context synthetique depuis `local_flow_exit_handoff`, donc il n'est plus audite comme standalone apres une sortie locale.
  - `supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`: tests de parent context apres local flow exit et anti-faux-positif pour entree globale normale.
  - Run reel `emotional-repair-local-doctrine-r8`: T3 `turn_note_source=emotional_repair`, `local_exit_source=emotional_repair`, `local_exit_consumed_by=global_dispatcher_second_pass`, `product_help.mode=inline`.
- Tests requis:
  - Integration locale `test-send-message`: T1/T2/T3 avec assertion T3 `active_flow_debug.user_state_loaded.raw_skill=emotional_repair`.
  - Assertion T3: sortie locale `emotional_repair` visible dans `conversation_turn_trace`, pas seulement dans une table de brain-trace optionnelle.
  - Assertion T3: `note_information.source_flow_id=emotional_repair` ou champ equivalent de handoff local source avant `product_help`.
  - Assertion T3: `product_help` n'est pas `standalone` quand il reprend apres sortie locale d'un flow actif.
