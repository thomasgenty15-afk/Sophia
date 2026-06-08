# Implementation Agent Prompt - demotivation_repair Local Flow

```txt
Mission : migrer demotivation_repair vers une architecture local dispatcher + reducer + visible prompts, avec bridge structure vers select_state_potion pour les potions clarte, courage et anti-decrochage.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Docs a lire avant implementation :
- docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md
- docs/agent-playbook/New/runtime-contracts/01-global-runtime.md
- docs/agent-playbook/New/runtime-contracts/Note d'information
- docs/agent-playbook/New/runtime-contracts/conversation-skills/demotivation-repair.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/demotivation-repair-local-flow-architecture.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/demotivation-repair-local-dispatcher-prompts.md
- docs/agent-playbook/New/runtime-contracts/tools/select-state-potion.md
- docs/agent-playbook/New/runtime-contracts/tools/select-state-potion-prompt-architecture.md

Code a etudier :
- supabase/functions/sophia-brain/skills/demotivation_repair/contract.ts
- supabase/functions/sophia-brain/skills/demotivation_repair/intake.ts
- supabase/functions/sophia-brain/skills/demotivation_repair/reducer.ts
- supabase/functions/sophia-brain/skills/demotivation_repair/renderer.ts
- supabase/functions/sophia-brain/skills/demotivation_repair/skill.ts
- supabase/functions/sophia-brain/skills/demotivation_repair/prompt.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/contract.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/clarte_flow.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/state_potion_subskill_flow.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/potions/clarte.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/potions/courage.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/potions/rappel.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/labels.ts
- supabase/functions/sophia-brain/router/run.ts
- supabase/functions/sophia-brain/router/active_flow_state.ts

Objectif architecture :

1. demotivation_repair local owner
   - Quand demotivation_repair est actif, le dispatcher global normal ne doit pas fonctionner.
   - Le tour passe par demotivation_repair.local_dispatcher, reducer, visible prompt.
   - Safety reste prioritaire au-dessus.

2. Visible prompts
   - Remplacer le renderer visible nominal par des prompts stage-specific.
   - Le visible agent ne decide pas, ne route pas, ne remplit pas la potion.
   - Il ecrit seulement depuis l'etat structure produit par dispatcher/reducer.

3. Bridge potion structure
   - Le bridge vers potion est autorise seulement pour :
     - clarte
     - courage
     - rappel, label visible Potion anti-décrochage
   - Le bridge exige diagnostic + consentement.
   - Le bridge transmet un `potion_bridge_context` exploitable par select_state_potion.
   - Le bridge transmet aussi une `note_information` exploitable par le prochain dispatcher.
   - Le sous-skill potion doit recevoir les candidats de champs afin d'eviter une repetition inutile.

4. Note d'information
   - Toute sortie qui transfere l'ownership vers un autre dispatcher doit produire une note d'information.
   - Pour le bridge potion, la note est transmise au dispatcher local de select_state_potion.
   - Pour exit_to_global_dispatcher, la note est transmise au dispatcher global lors de la seconde analyse.
   - La note contient deux parties :
     - presentation succincte du flow quitte ;
     - contexte utile au prochain dispatcher pour remplir son JSON.
   - La note n'est pas un message visible user.
   - La note ne doit pas devenir un moyen de refaire du routing deterministe.

Contraintes non negociables :
- Pas de regex metier.
- Pas de message.includes metier.
- Pas de renderer deterministe visible dans le chemin nominal.
- Pas de template fixe.
- Pas de second decideur cache.
- Pas de DB write.
- Pas de committed_effects.
- Pas de pending confirmation executable.
- Pas d'activation potion depuis le chat.
- Pas de bridge potion sans consentement.
- Pas de bridge potion si la source du decrochage n'est pas diagnostiquee.
- Pas de bridge potion si no_potion/no_tool/asks_no_tool_support le bloque.
- Pas de potions autres que clarte/courage/rappel depuis demotivation_repair.
- Ne jamais rendre "Potion rappel" ou "rappel" comme nom visible.

Implementation attendue :

1. Contrat local
   - Ajouter un contrat local demotivation_repair :
     - DemotivationRepairLocalDispatcherOutput
     - DemotivationRepairLocalFlowAction
     - DemotivationRepairLocalState
     - DemotivationRepairVisibleTask
     - DemotivationRepairPotionBridgeContext
   - Inclure le contrat JSON du doc prompts.
   - Valider les enums et invariants.

2. Dispatcher local
   - Ajouter `skills/demotivation_repair/local_dispatcher.ts` ou equivalent.
   - Appeler le modele en JSON strict.
   - Injecter :
     - user_message ;
     - recent_messages ;
     - active demotivation repair state ;
     - previous repair summary ;
     - previous potion bridge offer if any ;
     - turn_frame safety/risk ;
     - explicit constraints ;
     - possible potion bridge targets and fields.
   - Le dispatcher ne produit jamais de message visible.

3. Reducer
   - Consommer uniquement le JSON du dispatcher.
   - Appliquer les invariants existants :
     - do_not_moralize toujours ;
     - no_potion bloque reply + suggestion ;
     - no_tool bloque operation suggestions ;
     - no_plan_edit bloque adjust_plan_item ;
     - identity-freeze memory candidates non persistés par défaut ;
     - safety_preempt gagne.
   - Choisir visible_task.kind.
   - Produire `potion_bridge_context` quand confirmed_handoff.
   - Ne jamais creer de committed effects.

4. Potion bridge context
   - Pour clarte, produire candidat :
     - plan_meaning_loss_reason
   - Pour courage :
     - avoidance_target
     - blocker_kind option resultat/regard/inconfort/conflit
   - Pour rappel / Potion anti-décrochage :
     - drift_target
     - drift_style option oubli/repousse/laisse_filer/baisse_elan
   - Ajouter :
     - origin_flow="demotivation_repair"
     - note_information.source_flow_presentation
     - note_information.handoff_context_for_next_dispatcher
     - note_information.target_flow="select_state_potion"
     - note_information.target_local_dispatcher_hint
     - origin_turn_summary
     - demotivation_episode.summary
     - demotivation_episode.user_words
     - durable_need.kind
     - selected_potion
     - visible_potion_label
     - selection_reason
     - handoff_instruction_for_potion_subskill

5. Runtime handoff to select_state_potion
   - Quand demotivation_repair reducer sort `handoff_to_potion_flow`, demarrer select_state_potion avec :
     - selected_potion deja connu ;
     - active_subskill_id `select_state_potion.clarte|courage|rappel` ;
     - potion_bridge_context dans l'etat ;
     - note_information dans l'etat du nouveau flow ;
     - no_chat_mutation preserve.
   - Ne pas refaire passer le message par le dispatcher global comme decideur metier.
   - Si implementation temporaire via exit_memo, le global doit honorer le hint structure et ne pas choisir depuis le texte brut.

6. select_state_potion consumption
   - Modifier l'entree du sous-skill potion pour lire `origin_bridge_context`.
   - Modifier le dispatcher local de select_state_potion pour recevoir `note_information`.
   - La note doit aider le dispatcher potion a remplir son JSON et a eviter les repetitions.
   - Pour clarte, injecter le contexte dans `clarte_flow`.
   - Pour courage/rappel, injecter le contexte dans `state_potion_subskill_flow`.
   - Les valeurs du bridge sont des candidates :
     - high confidence + platform usable -> lock possible ;
     - medium -> proposed ;
     - low/missing -> ask_deeper.
   - Le sous-skill ne doit pas demander au user de repeter tout le decrochage.
   - Trace : conserver origin_flow, selected_potion, consumed candidates.
   - Trace : conserver note_information.source_flow_presentation et target_flow.

7. Visible prompts
   - Ajouter `skills/demotivation_repair/visible_agent.ts`.
   - Implementer :
     - diagnose
     - reduce_friction
     - restore_meaning
     - stabilize_energy
     - smaller_step
     - action_card_candidate
     - potion_bridge_offer
     - potion_bridge_choice
     - potion_bridge_handoff
     - ask_gentle_clarification
     - repeat_repair / exit_or_cancel
   - Aucun renderer deterministe nominal.
   - Guard final autorise seulement validation de contrat, no-mutation, no done-language, no forbidden potion labels.

8. Legacy cleanup
   - `renderer.ts` ne doit plus etre le chemin nominal.
   - Le prompt ancien `DEMOTIVATION_REPAIR_PROMPT` peut etre remplace ou limite au dispatcher local.
   - Supprimer toute classification metier par regex si elle existe dans le chemin nominal.
   - Garder uniquement les validations structurelles.

9. Observability
   - Ajouter logs/traces :
     - demotivation_repair.local_dispatcher_called
     - demotivation_repair.local_dispatcher_result
     - demotivation_repair.reducer_result
     - demotivation_repair.visible_prompt_called
     - demotivation_repair.potion_bridge_offered
     - demotivation_repair.potion_bridge_confirmed
     - demotivation_repair.handoff_to_select_state_potion
     - select_state_potion.origin_context_consumed

Tests unitaires attendus :

Dispatcher/reducer :
- fatigue_drop stays demotivation repair, no moralizing.
- loss_of_meaning does not route directly to potion before repair.
- no_potion blocks potion bridge.
- no_tool blocks all operation suggestions.
- diagnosed meaning reconnection -> potion_bridge_offer clarte.
- diagnosed avoidance/fear -> potion_bridge_offer courage.
- known gesture slipping -> potion_bridge_offer rappel/Potion anti-décrochage.
- user confirms offered potion -> handoff_to_potion_flow.
- safety_preempt wins.

Bridge context :
- clarte context fills plan_meaning_loss_reason candidate.
- courage context fills avoidance_target and blocker_kind candidate.
- rappel context fills drift_target and drift_style candidate.
- origin_flow is demotivation_repair.
- note_information is present on confirmed handoff.
- note_information has both required parts : source flow presentation and context for next dispatcher.
- visible label for rappel is Potion anti-décrochage.
- no_chat_mutation flags remain false.

select_state_potion consumption :
- bridge clarte starts select_state_potion.clarte without global rerouting.
- bridge courage starts select_state_potion.courage without global rerouting.
- bridge rappel starts select_state_potion.rappel without global rerouting.
- select_state_potion local dispatcher receives and can use note_information.
- high confidence bridge field can lock.
- medium confidence bridge field becomes proposed.
- low confidence bridge field asks one clarification.
- sous-skill does not ask user to repeat the full demotivation episode.
- apply_attempt after bridge still does not mutate.

Visible prompts :
- no template required.
- no activation wording.
- no wrong potion names.
- no "Potion rappel".
- no moralizing.
- no plan edit when forbidden.

QA runs recommandes :

1. Loss of meaning -> clarte
   User: "je fais les actions mais je ne vois plus pourquoi ca compte"
   Expected: demotivation repair first, then offer Potion de clarté only after meaning is clarified.

2. Avoidance -> courage
   User: "je repousse le mail parce que j'ai peur du retour"
   Expected: bridge candidate courage with avoidance_target and blocker_kind=resultat/regard depending wording.

3. Drift -> anti-decrochage
   User: "je sais que je veux garder ma marche du soir mais je la laisse filer"
   Expected: bridge candidate rappel, visible label Potion anti-décrochage, drift_target + drift_style=laisse_filer.

4. Refuse potion
   User: "pas de potion, aide-moi juste a baisser la friction"
   Expected: no_potion, repair response, no bridge.

5. Confirm bridge
   After offer Potion anti-décrochage, user: "oui"
   Expected: handoff_to_select_state_potion with selected_potion=rappel, origin_flow demotivation_repair, no global semantic reroute.

Definition of done :
- demotivation_repair local dispatcher exists.
- active demotivation repair skips global dispatcher normal.
- visible prompts replace renderer nominal.
- potion bridge context is structured and consumed by select_state_potion.
- Only clarte/courage/rappel are bridgeable from demotivation_repair.
- No durable effect is possible.
- Tests and a short QA report are added.
```
