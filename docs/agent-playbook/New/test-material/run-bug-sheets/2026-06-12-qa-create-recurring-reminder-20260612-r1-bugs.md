# 2026-06-12 - qa-create-recurring-reminder-20260612-r1 Bugs

## R1-B01

- Bug id: R1-B01
- Tours: Tour 5
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `create_recurring_reminder` local flow/runtime
- Source amont: local dispatcher JSON output formatting/parsing on explicit topic change while active flow is loaded
- Symptome visible: Sophia repond de maniere acceptable en laissant le rappel de cote, mais ne passe pas effectivement au dispatcher global pour traiter la priorisation.
- Preuve systeme: run r4, tour 5: `tool_skill_runtime.status=blocked`, `reason_code=local_dispatcher_failed`, `local_dispatcher=null`, `local_reducer=null`; diagnostic observe `phase=normalize`, `error_name=SyntaxError`, `error_message=Unexpected non-whitespace character after JSON at position 4954`. L'extrait brut commence par un JSON avec `flow_action=exit_to_global_dispatcher`, donc la decision semantique etait correcte mais la sortie etait non parsable. Route active `create_recurring_reminder` garde `global_dispatcher` bloque; `user_chat_states.temp_memory.__recurring_reminder_handoff_state` reste present apres le tour.
- Correction attendue: garantir une sortie JSON strictement parsable du dispatcher local pour les exits, ou durcir le parsing de maniere structurelle si le provider renvoie un JSON valide suivi de texte non JSON; le reducer doit ensuite nettoyer l'etat local et permettre la reprise du dispatcher cible selon la doctrine locale, sans fallback visible construit par code ni regex metier.
- Statut: `open`
- Fix reference: pending
- Tests requis: test de parsing sortie dispatcher avec JSON valide suivi de texte non JSON, run positif exit topic change, paraphrase de changement de sujet, anti-faux-positif ou le user continue/revise le rappel, verification que l'etat local est nettoye et que le global n'est appele que via `exit_to_global_dispatcher`.
