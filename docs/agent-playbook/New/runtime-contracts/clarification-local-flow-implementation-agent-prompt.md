# Implementation Agent Prompt - clarification Local Flow

```txt
Mission : migrer clarification/orientation_clarification vers un flow local multi-tour qui arbitre entre plusieurs signaux candidats forts, sans inventer de route, sans mutation, sans renderer deterministe nominal, et avec note_information sur chaque changement de dispatcher.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Docs a lire avant implementation :
- docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md
- docs/agent-playbook/New/runtime-contracts/01-global-runtime.md
- docs/agent-playbook/New/runtime-contracts/Note d'information
- docs/agent-playbook/New/runtime-contracts/clarification-tool.md
- docs/agent-playbook/New/runtime-contracts/tools/clarification-tool.md
- docs/agent-playbook/New/runtime-contracts/clarification-local-flow-architecture.md
- docs/agent-playbook/New/runtime-contracts/clarification-local-dispatcher-prompts.md
- docs/agent-playbook/New/runtime-contracts/note-information-cross-dispatcher-agent-prompts.md
- docs/agent-playbook/New/runtime-contracts/flow-presentation-catalog.md

Code a etudier :
- supabase/functions/sophia-brain/clarification/contract.ts
- supabase/functions/sophia-brain/clarification/tool.ts
- supabase/functions/sophia-brain/clarification/renderer.ts
- supabase/functions/sophia-brain/clarification/state.ts
- supabase/functions/sophia-brain/clarification/resources.ts
- supabase/functions/sophia-brain/router/clarification_candidate_builder.ts
- supabase/functions/sophia-brain/router/clarification_arbitrator.ts
- supabase/functions/sophia-brain/router/run.ts
- supabase/functions/sophia-brain/router/active_flow_state.ts
- supabase/functions/sophia-brain/router/turn_intent_arbitrator.ts
- supabase/functions/sophia-brain/skills/_shared/clarification_adapter.ts
- supabase/functions/sophia-brain/tools/operations/inline_info_tools.ts

Objectif architecture :

1. Local owner
   - Quand clarification est active, le dispatcher global normal ne doit pas fonctionner.
   - Le tour passe par clarification.local_dispatcher, reducer, visible prompt.
   - Safety reste prioritaire via sortie locale safety_preempt.

2. Candidate-only arbitration
   - clarification recoit des candidate_signals fermes.
   - Elle peut choisir seulement un candidate_id fourni.
   - Elle ne peut pas inventer un flow, une operation ou un candidat.
   - Elle ne doit pas router depuis le message brut.

3. Multi-turn
   - Persist active state sous une cle claire, par exemple __clarification_flow_state.
   - Conserver candidate_signals, conflict_summary, source_flow_id, source_dispatcher, user_words.
   - Permettre plusieurs tours tant que le conflit reste ambigue.
   - Permettre stop local / cancel / topic change / safety.

4. Reducer
   - Valider que selected_candidate_id existe.
   - Refuser resolved_to_candidate si confidence=low.
   - Produire note_information pour target dispatcher.
   - Ne jamais executer le candidat directement.
   - Choisir visible_task.kind.
   - Clear state sur resolved/cancel/safety/topic_change.

5. Visible prompts
   - Remplacer renderClarificationQuestion comme chemin nominal visible.
   - Visible agent stage-specific :
     - ask_disambiguation
     - ask_simpler_choice
     - still_ambiguous
     - resolved_transition
     - explain_options
     - repeat_question
     - stop_or_cancel
     - exit_ack
     - inline_tool_return
     - safety
   - Le visible agent ne decide pas.

6. Runtime ownership transfer
   - resolved_to_candidate :
     - transmettre note_information au dispatcher cible ;
     - target dispatcher remplit son JSON ;
     - pas d'execution directe sur le tour de resolution.
   - exit_to_global_dispatcher :
     - transmettre note_information au global ;
     - global reanalyse avec le contexte.
   - safety_preempt :
     - transmettre note_information a safety_crisis local dispatcher ;
     - global normal skipped.
   - get_info_product/get_info_db :
     - inline roundtrip avec note_information ;
     - reprise du flow clarification parent.
   - stop_local_no_handoff/cancel :
     - ack visible ;
     - clear state ;
     - pas de global sur le meme tour.

Contraintes non negociables :
- Pas de regex metier.
- Pas de message.includes metier.
- Pas de modele deterministe de routing.
- Pas de candidat invente.
- Pas de renderer visible deterministe dans le chemin nominal.
- Pas de DB write.
- Pas de tool execution.
- Pas de pending confirmation executable.
- Pas de global dispatcher pendant active clarification sauf exit_to_global_dispatcher.
- Pas de global dispatcher sur stop_local_no_handoff.
- Ne pas executer supabase db reset.
- Ne pas faire de commandes Supabase destructives.

Implementation attendue :

1. Types
   - Ajouter ClarificationLocalDispatcherOutput.
   - Ajouter ClarificationLocalFlowAction.
   - Ajouter ClarificationLocalState.
   - Ajouter ClarificationVisibleTask.
   - Ajouter ou reutiliser NoteInformation.

2. Dispatcher local
   - Creer clarification/local_dispatcher.ts ou equivalent.
   - Utiliser le prompt dans clarification-local-dispatcher-prompts.md.
   - JSON mode strict.
   - Inclure candidate_signals, active state, recent messages, inbound note_information.
   - Aucun fallback metier par regex.

3. Reducer
   - Creer clarification/reducer.ts.
   - Consommer uniquement le JSON dispatcher.
   - Valider candidate ids.
   - Construire outbound note_information.
   - Choisir visible_task.kind.
   - Gerer state lifecycle.

4. Visible agent
   - Creer clarification/visible_agent.ts.
   - Garder renderer.ts legacy/fallback seulement si necessaire, hors chemin nominal.
   - Aucun template fixe.
   - Une seule question pour les prompts de question.

5. Runtime integration
   - Remplacer orientation_clarification one-shot par active flow local.
   - maybeStartDispatcherClarification peut demarrer le flow local quand 2+ signaux forts existent.
   - maybeStartActiveSkillClarification doit demarrer ou reprendre le meme flow local avec source_flow_id.
   - active_flow_state doit reconnaitre clarification.
   - final response pipeline doit respecter visible output du flow.
   - EffectLedger doit tracer clarification comme non-mutant.

6. Note information
   - Au demarrage, recevoir inbound note_information depuis source dispatcher/flow.
   - A la resolution, transmettre outbound note_information au target dispatcher.
   - Pour safety/topic/global/inline, transmettre note_information adaptee.
   - Logs attendus :
     - clarification_local_dispatcher_result
     - clarification_started
     - clarification_resolved_with_note
     - clarification_cancelled_local
     - clarification_exit_to_global_with_note
     - clarification_to_safety_with_note
     - clarification_inline_tool_with_note

Tests unitaires attendus :

Dispatcher/reducer :
- two high-confidence candidates -> ask_disambiguation.
- user answer selects candidate -> resolved_to_candidate.
- selected candidate absent -> validation rejects / asks simpler choice.
- confidence low with selected candidate -> not resolved.
- still ambiguous -> remains active.
- stop local -> clear state, no global.
- topic change -> exit_to_global_dispatcher with note.
- safety -> safety_preempt with note.
- product question -> get_info_product with note and parent resume.
- DB/status question -> get_info_db with note and parent resume.

Runtime :
- active clarification skips global dispatcher.
- resolved candidate does not execute directly.
- target dispatcher receives note_information.
- cancellation does not call global.
- topic change calls global only after local exit.
- safety local receives note, global normal skipped.

Visible :
- ask prompts contain one question.
- no internal terms visible : dispatcher, candidate_id, operation_type, JSON.
- stop/cancel prompt does not ask final question.
- resolved transition does not claim execution.

Runs IA reels attendus :
1. product_help vs prepare_attack_card
   User: "c'est quoi une carte attaque pour demain ?"
   Expected: clarification asks whether user wants explanation or preparation.
2. one_shot_reminder vs create_recurring_reminder
   User: "rappelle-moi demain, enfin tous les matins"
   Expected: clarification asks punctual vs recurring.
3. prepare_attack_card vs prepare_defense_card
   User answer resolves to defense.
   Expected: target dispatcher prepare_defense_card receives note_information.
4. user says "laisse tomber"
   Expected: stop local, no global, no question.
5. user says "laisse ca, aide-moi a prioriser"
   Expected: exit_to_global_dispatcher with note.
6. active clarification, user asks "c'est quoi la difference ?"
   Expected: explain_options or product inline, then return to clarification.
7. active clarification, safety message.
   Expected: safety_preempt with note.

Livrable final :
- Code compile.
- Tests unitaires passes.
- Rapport QA court.
- Liste des anciens chemins orientation_clarification encore presents ou retires.
- Confirmation explicite :
  - aucun regex metier ajoute ;
  - aucun candidat invente ;
  - aucun renderer visible deterministe nominal ;
  - aucun effet execute depuis clarification ;
  - global dispatcher normal non appele pendant clarification active sauf exit_to_global_dispatcher ;
  - note_information presente sur chaque changement de dispatcher.
```

