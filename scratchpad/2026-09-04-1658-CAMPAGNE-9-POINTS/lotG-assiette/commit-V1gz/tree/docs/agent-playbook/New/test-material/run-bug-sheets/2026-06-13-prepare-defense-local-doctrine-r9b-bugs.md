# Bug Sheet - prepare_defense_card Local Doctrine R9b

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, persona `alex`, run `prepare-defense-local-doctrine-r9b`. Aucun fallback utilise. Cleanup cible effectue sur `r9` et `r9b`.

## Bugs

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R9B-B01 | T6 | BF-TEST-01 | Turn trace / observabilite `router/run.ts` | Projection finale `conversation_turn_trace` apres multi-owner turn | La reponse visible passe correctement a une carte d'attaque, mais la trace courte finale masque la sortie locale defense et donne l'impression d'un `no_active_flow` direct | Trace finale: `read_active_flow_state` voit `active_tool_skill_id=prepare_defense_card`; `before_run_conversation_routers` ne voit plus les cles; route finale `selected_handler=prepare_attack_card`, `reason_code=tool_skill_intent_start`, `active_flow_arbitration.reason_code=no_active_flow`. Preuve complementaire DB: `llm_usage_events` et `llm_raw_response_events` montrent `prepare_defense_card.local_dispatcher` puis `dispatcher-v2-llm` puis `prepare_attack_card.local_dispatcher`; le raw defense retourne `flow_action=exit_to_global_dispatcher`, `note_information.source_flow_id=prepare_defense_card`, `target_dispatcher=global`, `recommended_next_focus=prepare_attack_card`. | Ajouter une trace finale de chaine de transition multi-owner: active owner initial, local exit action, note_information source/target, global reroute, target local dispatcher. Ne pas conclure `no_active_flow` sans exposer que l'etat a ete clear par sortie locale explicite. | open |  | Positif: defense active + "j'ai besoin d'une carte d'attaque" -> `conversation_turn_trace.transition_chain` contient local exit defense puis global route attack. Anti-FP: destination/apply/revision restent defense sans global. Integration: test `processMessage` complet verifiant la trace finale, pas seulement `llm_raw_response_events`. |

## Notes

- Le bug R8-B01 sur le rythme premier tour est verifie comme corrige par R9b T1: aucune restitution plateforme, aucune destination, aucune valeur a recopier au premier message visible.
- T1-T5 confirment que le flow defense actif fonctionne pour enrichissement, proposition, handoff, apply attempt et destination followup.
- T6 confirme que le chemin doctrinal est reellement suivi en traces LLM brutes; la bug sheet conserve seulement un bug d'observabilite finale.
- Aucun effet durable interdit observe: `user_defense_cards=[]`, `executed_tools=[]`, pas de pending confirmation.
