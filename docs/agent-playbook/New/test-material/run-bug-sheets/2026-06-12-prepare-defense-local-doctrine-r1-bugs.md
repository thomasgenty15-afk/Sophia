# Bug Sheet - prepare_defense_card Local Doctrine R1

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, persona `alex`, run `prepare-defense-local-doctrine-r1`. Aucun fix pendant le run. Cleanup cible effectue sur le scope QA.

## R1-B01

- Bug id: `R1-B01`
- Tours: T1
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `prepare_defense_card`
- Source amont: reducer local / gate de verrouillage `support_need`
- Symptome visible: Sophia livre deja la destination plateforme et le champ a copier, mais demande encore "Est-ce que cette description te convient ?"
- Preuve systeme: dispatcher local `flow_action=confirm_proposed_field`, `visible_task=confirm_support_need_proposal`, `support_need=proposed`; reducer transforme en `visible_task=handoff_ready`, `support_need=locked`, `tool_execution=platform_handoff`.
- Correction attendue: ne verrouiller `support_need` sur `confirm_proposed_field` que si une candidate existait dans l'etat precedent ou si le dispatcher retourne explicitement `support_need_state.status=locked`; sinon conserver `confirm_support_need_proposal`.
- Statut: `open`
- Fix reference: a definir
- Tests requis: entree claire premier tour avec `support_need=proposed` -> pas de destination; confirmation courte ensuite -> `platform_handoff`; anti-faux-positif avec reponse claire `locked` -> handoff direct.

## R1-B02

- Bug id: `R1-B02`
- Tours: T6
- Famille: `BF-ROUTE-02` - Active flow / interruption policy contourne le flow actif
- Domaine owner: active flow routing / `prepare_defense_card` lifecycle
- Source amont: effacement de `__active_tool_skill_intake` avant passage par le dispatcher local actif
- Symptome visible: la reponse est correcte, mais la transition ne prouve pas la sortie locale defense.
- Preuve systeme: active flow debug montre `active_tool_skill_id=prepare_defense_card` a `read_active_flow_state`, puis plus d'active flow avant `before_run_conversation_routers`; `route_reason=tool_skill_intent_start`; `note_information.source_flow_id=global_dispatcher`; aucun event `prepare_defense_card.local_flow` ni `exit_to_global_dispatcher` sur T6.
- Correction attendue: conserver l'ownership `prepare_defense_card` jusqu'a decision explicite du dispatcher local. Pour carte d'attaque, defense retourne `exit_to_global_dispatcher` + `note_information.target_dispatcher=global` + `recommended_next_focus=prepare_attack_card`; seulement ensuite le global reanalyse.
- Statut: `open`
- Fix reference: a definir
- Tests requis: apres handoff/apply_attempt defense, message de changement vers attaque -> trace `prepare_defense_card.local_dispatcher decision exit_to_global_dispatcher`; global appele ensuite; note source `prepare_defense_card`; aucun handoff local direct defense -> attack.
