# Bug Sheet - prepare_defense_card Local Doctrine R8

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, persona `alex`, run `prepare-defense-local-doctrine-r8`. Aucun fallback utilise. Cleanup cible effectue.

## Bugs

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R8-B01 | T1 | BF-STATE-01 | `prepare_defense_card` local flow | Reducer -> `visible_task.conversation_context` / visible guard stage-specific | Premier tour trop rapide: Sophia expose le champ plateforme, la valeur a recopier et la destination produit avant une vraie passe d'echange | Trace T1: dispatcher visible task `ask_trigger_or_signal`, reducer visible task `ask_defense_goal_or_response`, `handoff_ready=false`, `support_need_status=proposed`, mais reponse visible contient label plateforme + formulation + destination | Pendant les stages d'enrichissement du premier tour, ne pas transmettre les donnees de handoff au visible agent; ajouter un guard de stage qui rejette label plateforme/destination/formulation a recopier avant `handoff_ready` | open |  | Positif: entree defense riche -> Sophia pose une question d'enrichissement sans champ plateforme. Paraphrase: fatigue/impulsion/scroller. Anti-FP: apres un vrai tour d'enrichissement, handoff peut exposer le champ. Integration: verifier `runtime_trace.visible_task_kind` et absence de wording plateforme. |
| R8-B02 | T6 | BF-ROUTE-02 | Active flow routing / `router/run.ts` | Lifecycle temp memory avant conversation routers | Demande explicite de carte d'attaque pendant defense active route directement vers `prepare_attack_card` sans sortie locale defense | Trace T6: `read_active_flow_state` voit `active_tool_skill_id=prepare_defense_card` avec `__active_defense_card_handoff`; `before_run_conversation_routers` ne voit plus les cles; route finale `selected_handler=prepare_attack_card`, `reason_code=tool_skill_intent_start`, `active_flow_arbitration.reason_code=no_active_flow`; aucun `prepare_defense_card.local_exit_to_global_dispatcher` | Si defense active est detecte, appeler `prepare_defense_card.local_dispatcher` avant tout clear de handoff. Seule sortie autorisee: local `exit_to_global_dispatcher` + `note_information`, puis global dispatcher route vers attaque. | open |  | Positif: defense active + "j'ai besoin d'une carte d'attaque" -> trace local exit puis global route attack. Anti-FP: destination/apply/revision restent defense. Integration: test `processMessage` complet reproduisant la disparition entre `read_active_flow_state` et `before_run_conversation_routers`. |

## Notes

- T2-T5 confirment que le flow defense actif fonctionne pour handoff, confirmation, apply attempt et destination followup.
- Aucun effet durable interdit observe: `user_defense_cards=0`, `executed_tools=[]`, pas de pending confirmation.
