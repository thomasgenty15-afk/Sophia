# 2026-06-15 recurring-state-r1 Bugs

## R1-B01

- Bug id: R1-B01
- Tours: T6
- Famille: BF-ROUTE-01 - Mauvais owner selectionne
- Domaine owner: Sophia Brain active flow arbitration / create_recurring_reminder local runtime
- Source amont: active flow interruption/exit policy before local dispatcher invocation
- Symptome visible: reponse utilisateur acceptable en normal reply, mais sortie du flow sans trace locale d'exit
- Preuve systeme: au T6, `read_active_flow_state.active_tool_skill_id=create_recurring_reminder`, puis `response_owner=normal_reply`, `route_reason=normal_reply_default`, aucun `tool_skill_run.local_reducer`, aucun `exit_to_global_dispatcher`, aucune `note_information` locale
- Correction attendue: quand un flow local create_recurring_reminder est actif, router le tour vers le runtime local; le dispatcher local doit retourner `exit_to_global_dispatcher` avec `note_information`, puis seulement ensuite le dispatcher global peut traiter le nouveau sujet
- Statut: open
- Fix reference: none
- Tests requis: integration active recurring reminder exit; paraphrase changement de sujet; anti-faux-positif continuation locale; assertion trace `local_reducer.exit_to_global_dispatcher=true` avant `normal_reply`
