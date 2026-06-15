# Bug Sheet - Post Morning Nudge Stateful Real R1

## R1-B01

- Bug id: `R1-B01`
- Tours: Variante 1 - changement explicite pendant active state
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: Sophia Brain router / active flow arbitration / post-morning-nudge local flow boundary
- Source amont: politique d'arbitrage active flow avant passage au dispatcher local
- Symptome visible: aucun symptome UX bloquant; Sophia repond correctement en surface et lance la Potion de clarte.
- Preuve systeme: trace `route_reason=tool_skill_intent_start`, `selected_handler=select_state_potion.clarte`, `turn_frame.note_information.source_flow_id=global_dispatcher`; en parallele, `active_flow_debug.snapshots` montre encore `raw_active_skill.skill_id=post_morning_nudge` et `__post_morning_nudge_active_state_v1`.
- Correction attendue: si un active state post-morning-nudge est present, router d'abord vers le dispatcher local correspondant. En cas de changement de sujet clair, le dispatcher local doit produire `flow_action=exit_to_global_dispatcher` et une `note_information`; le second pass global ne doit arriver qu'ensuite.
- Statut: `open`
- Fix reference: none yet
- Tests requis: integration/runtime avec active state post-morning-nudge + demande explicite potion; assert `post_morning_nudge.*_dispatcher` execute en premier, `flow_action=exit_to_global_dispatcher`, `note_information.target_dispatcher=select_state_potion`, puis second pass global vers `select_state_potion`.
