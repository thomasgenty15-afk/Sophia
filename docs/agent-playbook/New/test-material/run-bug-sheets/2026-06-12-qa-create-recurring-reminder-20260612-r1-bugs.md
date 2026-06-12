# 2026-06-12 - qa-create-recurring-reminder-20260612-r1 Bugs

## R1-B01

- Bug id: R1-B01
- Tours: Tour 5
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `create_recurring_reminder` local flow/runtime
- Source amont: local dispatcher transition handling for explicit topic change while active flow is loaded
- Symptome visible: Sophia repond de maniere acceptable en laissant le rappel de cote, mais ne passe pas effectivement au dispatcher global pour traiter la priorisation.
- Preuve systeme: `tool_skill_runtime.status=blocked`, `reason_code=local_dispatcher_failed`, `local_dispatcher=null`, `local_reducer=null`; route active `create_recurring_reminder` garde `global_dispatcher` bloque; `user_chat_states.temp_memory.__recurring_reminder_handoff_state` reste present apres le tour.
- Correction attendue: le dispatcher local doit retourner `exit_to_global_dispatcher` avec `note_information` exploitable pour un nouveau sujet clair, puis le reducer doit nettoyer l'etat local et permettre la reprise du dispatcher cible selon la doctrine locale, sans fallback visible construit par code.
- Statut: `open`
- Fix reference: pending
- Tests requis: run positif exit topic change, paraphrase de changement de sujet, anti-faux-positif ou le user continue/revise le rappel, verification que l'etat local est nettoye et que le global n'est appele que via `exit_to_global_dispatcher`.
