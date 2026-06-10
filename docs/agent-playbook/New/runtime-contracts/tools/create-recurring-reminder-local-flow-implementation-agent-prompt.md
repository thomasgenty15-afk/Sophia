# Implementation Agent Prompt - create_recurring_reminder Local Flow

```txt
Mission : migrer create_recurring_reminder vers une architecture local dispatcher + reducer + visible prompts, sans renderer visible deterministe dans le chemin nominal, sans regex metier, sans mutation DB, et avec note_information sur chaque changement de dispatcher.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Docs a lire avant implementation :
- docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md
- docs/agent-playbook/New/runtime-contracts/01-global-runtime.md
- docs/agent-playbook/New/runtime-contracts/Note d'information
- docs/agent-playbook/New/runtime-contracts/note-information-cross-dispatcher-agent-prompts.md
- docs/agent-playbook/New/runtime-contracts/tools/create-recurring-reminder.md
- docs/agent-playbook/New/runtime-contracts/tools/create-recurring-reminder-local-flow-architecture.md
- docs/agent-playbook/New/runtime-contracts/tools/create-recurring-reminder-local-dispatcher-prompts.md
- docs/agent-playbook/New/runtime-contracts/tools/one-shot-reminder.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help-local-dispatcher-prompts.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/status-recap-local-dispatcher-prompts.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/safety-crisis-local-flow-architecture.md

Code a etudier :
- supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/contract.ts
- supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/intake.ts
- supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/state.ts
- supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/generator.ts
- supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/router.ts
- supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/renderer.ts
- supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/executor.ts
- supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/persistence.ts
- supabase/functions/sophia-brain/tools/operations/inline_info_tools.ts
- supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/**/*
- supabase/functions/sophia-brain/router/run.ts
- supabase/functions/sophia-brain/router/active_flow_state.ts
- supabase/functions/sophia-brain/router/handoff_flow_arbitration.ts
- supabase/functions/sophia-brain/router/local_reducer.ts

Objectif architecture :

1. Local owner
   - Quand create_recurring_reminder est actif, le dispatcher global normal ne doit pas fonctionner.
   - Le tour passe par create_recurring_reminder.local_dispatcher, reducer, visible prompt.
   - Safety reste prioritaire via sortie locale safety_preempt.

2. Dispatcher local
   - Remplacer le slot filler comme decideur nominal par un dispatcher local JSON.
   - Le dispatcher remplit recurrence, reminder_content, destination/binding.
   - Il decide aussi revise/repeat/apply/cancel/one-shot boundary/product/status/global/safety.
   - Il ne produit jamais de message visible.

3. Reducer
   - Consommer uniquement le JSON du dispatcher.
   - Valider les statuts et les champs.
   - Construire ou mettre a jour l'etat actif.
   - Choisir visible_task.kind.
   - Produire platform_handoff quand les champs minimum sont prets.
   - Produire note_information pour tout changement de dispatcher.
   - Ne jamais creer de committed effects.

4. Visible prompts
   - Remplacer le renderer visible nominal par un visible_agent stage-specific.
   - Le visible agent ne decide pas les champs.
   - Il ecrit naturellement depuis visible_task.required_data.
   - Il ne dit jamais que le rappel est cree, programme ou actif.

5. Boundary one-shot
   - Si le dispatcher local determine une demande ponctuelle claire :
     - flow_action=handoff_to_one_shot ;
     - note_information vers one_shot_reminder ;
     - aucun draft recurrent ;
     - aucun global semantic reroute si one_shot peut recevoir directement.
   - Si ponctuel vs recurrent est ambigu :
     - visible_task=clarify_one_shot_vs_recurring ;
     - rester dans create_recurring_reminder.

6. Inline tools
   - Ajouter get_info_product et get_info_db comme roundtrips inline.
   - Chaque appel porte note_information avec active_flow_context.
   - Le flow parent reprend apres la reponse inline.

7. Stop local
   - Si le user veut juste arreter le flow sans nouveau sujet :
     - stop_local_no_handoff ou cancel_flow ;
     - clear/defer recurring state ;
     - visible ack court ;
     - pas de global dispatcher sur le meme tour.

Contraintes non negociables :
- Pas de regex metier.
- Pas de message.includes metier.
- Pas de modele deterministe de routing.
- Pas de renderer visible deterministe dans le chemin nominal.
- Pas de template visible fixe.
- Pas de DB write.
- Pas de pending confirmation executable.
- Pas de confirmation token.
- Pas de recurring reminder created depuis chat.
- Pas de wording "c'est cree", "programme", "active", "je te relancerai".
- Pas de global dispatcher pendant active flow sauf exit_to_global_dispatcher.
- Pas de global dispatcher sur stop_local_no_handoff.
- Ne pas executer supabase db reset.
- Ne pas faire de commande Supabase destructive.

Implementation attendue :

1. Types
   - Ajouter CreateRecurringReminderLocalDispatcherOutput.
   - Ajouter CreateRecurringReminderLocalFlowAction.
   - Ajouter CreateRecurringReminderVisibleTask.
   - Ajouter CreateRecurringReminderLocalState si necessaire.
   - Ajouter NoteInformation au contrat de transitions.

2. Dispatcher local
   - Creer un module local_dispatcher.ts ou equivalent.
   - Utiliser le prompt dans create-recurring-reminder-local-dispatcher-prompts.md.
   - JSON mode strict.
   - Pas de fallback metier par regex.
   - Si sortie invalide : contract validation error / ask safe clarification, pas inference code.

3. Reducer
   - Extraire la logique nominale de router/intake vers reducer.ts si necessaire.
   - Etat structure :
     - recurrence ;
     - reminder_content ;
     - destination ;
     - handoff_draft ;
     - last_visible_task ;
     - note_information inbound/outbound.
   - Construire RecurringReminderHandoffDraft seulement si minimum_fields_ready.
   - Appliquer no_chat_mutation.

4. Visible agent
   - Creer visible_agent.ts.
   - Implementer les prompts :
     - ask_recurrence
     - ask_time
     - ask_content
     - ask_destination_binding
     - clarify_one_shot_vs_recurring
     - handoff_ready
     - revise_handoff
     - repeat_handoff
     - platform_destination_followup
     - apply_attempt
     - handoff_to_one_shot
     - stop_or_cancel
     - exit_ack
   - Supprimer renderer.ts du chemin nominal.
   - Garder renderer.ts uniquement legacy/test si necessaire, hors nominal.

5. Runtime routing
   - Quand __recurring_reminder_handoff_state actif :
     - skip dispatcher global ;
     - appeler local dispatcher.
   - exit_to_global_dispatcher :
     - transmettre note_information ;
     - global reanalyse avec la note.
   - safety_preempt :
     - transmettre note_information a safety_crisis local dispatcher ;
     - global normal skipped.
   - handoff_to_one_shot :
     - transmettre note_information a one_shot_reminder ;
     - aucun draft recurrent.
   - get_info_product/get_info_db :
     - inline tool avec note ;
     - retour au flow parent.

6. Legacy removal from nominal path
   - Ne pas appeler renderer.ts pour les reponses nominales.
   - Ne pas appeler executor.ts/persistence.ts dans le chemin nominal.
   - Retirer ou isoler les branches executed du nominal.
   - Garder les protections EffectLedger/no_chat_mutation.
   - Les checks deterministes autorises : validation contrat, no_chat_mutation,
     EffectLedger, anti-duplication, safety-critical guards.

Tests unitaires attendus :

Dispatcher :
- clear recurring request with cadence/time/message -> handoff_ready.
- missing time -> ask_time.
- missing message -> ask_content.
- ambiguous cadence -> ask_recurrence.
- ambiguous one-shot/recurring -> clarify_one_shot_vs_recurring.
- clear one-shot -> handoff_to_one_shot with note_information.
- product question -> get_info_product with note_information.
- DB/status question -> get_info_db with note_information.
- stop local wording -> stop_local_no_handoff, no global.
- topic change -> exit_to_global_dispatcher with note_information.
- safety -> safety_preempt with note_information.

Reducer :
- handoff_ready writes __recurring_reminder_handoff_state.
- apply_attempt never mutates.
- revise_handoff updates structured draft.
- repeat_handoff stays local.
- handoff_to_one_shot clears recurring draft or marks no recurring draft.
- stop_local_no_handoff clears/defer state and does not call global.
- exit_to_global_dispatcher carries note.

Visible :
- no forbidden wording.
- no fixed template required.
- handoff includes message/cadence/time/destination.
- apply_attempt says cannot program from chat and gives platform path.
- destination followup short.
- stop local ack short with no question.

Runtime :
- active recurring flow skips global dispatcher.
- global runs only after local exit_to_global_dispatcher.
- product/status inline roundtrip resumes parent flow.
- safety local receives note and global normal is skipped.
- one-shot handoff receives note and no recurring draft.

Runs IA reels attendus :
1. "Rappelle-moi tous les matins a 8h de boire un verre d'eau"
   Expected: handoff_ready in one turn, no DB write.
2. "Rappelle-moi tous les matins de respirer"
   Expected: ask_time only.
3. "Rappelle-moi a 8h"
   Expected: ask_recurrence or ask_content depending context; one question only.
4. "Demain a 8h rappelle-moi d'appeler Camille"
   Expected: handoff_to_one_shot with note, no recurring draft.
5. "Tous les lundis, enfin juste lundi prochain"
   Expected: clarify_one_shot_vs_recurring.
6. After handoff, user: "ok programme-le"
   Expected: apply_attempt, no mutation, platform path.
7. Active flow, user: "c'est quoi un rappel recurrent ?"
   Expected: get_info_product inline with active flow note.
8. Active flow, user: "j'en ai deja combien ?"
   Expected: get_info_db inline with active flow note.
9. Active flow, user: "laisse tomber"
   Expected: stop local, no global, no question.
10. Active flow, user: "laisse ca, aide-moi a prioriser"
   Expected: exit_to_global_dispatcher with note.

Livrable final :
- Code compile.
- Tests unitaires passes.
- Rapport QA court.
- Liste des fichiers legacy encore presents mais hors chemin nominal.
- Confirmation explicite :
  - aucun regex metier ajoute ;
  - aucun renderer visible deterministe nominal ;
  - aucun DB write recurring ;
  - global dispatcher normal non appele pendant active flow sauf exit_to_global_dispatcher ;
  - note_information presente sur chaque changement de dispatcher.
```

