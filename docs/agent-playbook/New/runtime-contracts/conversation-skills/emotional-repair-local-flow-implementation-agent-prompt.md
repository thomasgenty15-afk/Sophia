# Implementation Agent Prompt - emotional_repair Local Flow

```txt
Mission : migrer emotional_repair vers une architecture local dispatcher + reducer + visible prompts, avec bridge structure vers select_state_potion pour les potions amour, guerison et apaisement.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Docs a lire avant implementation :
- docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md
- docs/agent-playbook/New/runtime-contracts/01-global-runtime.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/emotional-repair.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/emotional-repair-local-flow-architecture.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/emotional-repair-local-dispatcher-prompts.md
- docs/agent-playbook/New/runtime-contracts/tools/select-state-potion.md
- docs/agent-playbook/New/runtime-contracts/tools/select-state-potion-prompt-architecture.md

Code a etudier :
- supabase/functions/sophia-brain/skills/emotional_repair/contract.ts
- supabase/functions/sophia-brain/skills/emotional_repair/intake.ts
- supabase/functions/sophia-brain/skills/emotional_repair/reducer.ts
- supabase/functions/sophia-brain/skills/emotional_repair/renderer.ts
- supabase/functions/sophia-brain/skills/emotional_repair/skill.ts
- supabase/functions/sophia-brain/skills/emotional_repair/prompt.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/contract.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/state_potion_subskill_flow.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/potions/amour.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/potions/guerison.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/potions/apaisement.ts
- supabase/functions/sophia-brain/router/run.ts
- supabase/functions/sophia-brain/router/active_flow_state.ts

Objectif architecture :

1. emotional_repair local owner
   - Quand emotional_repair est actif, le dispatcher global normal ne doit pas fonctionner.
   - Le tour passe par emotional_repair.local_dispatcher, reducer, visible prompt.
   - Safety reste prioritaire au-dessus.

2. Visible prompts
   - Remplacer le renderer visible nominal par des prompts stage-specific.
   - Le visible agent ne decide pas, ne route pas, ne remplit pas la potion.
   - Il ecrit seulement depuis l'etat structure produit par dispatcher/reducer.

3. Bridge potion structure
   - Le bridge vers potion est autorise seulement pour :
     - amour
     - guerison
     - apaisement
   - Le bridge exige stabilisation + consentement.
   - Le bridge transmet un `potion_bridge_context` exploitable par select_state_potion.
   - Le sous-skill potion doit recevoir les candidats de champs afin d'eviter une repetition inutile.

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
- Pas de bridge potion si honte/panique/culpabilite/auto-attaque domine encore.
- Pas de bridge potion si no_potion/no_tool/soft_support_only/no_protocol/no_technique le bloque.
- Pas de potions autres que amour, guerison, apaisement depuis emotional_repair.

Implementation attendue :

1. Contrat local
   - Ajouter un contrat local emotional_repair :
     - EmotionalRepairLocalDispatcherOutput
     - EmotionalRepairLocalFlowAction
     - EmotionalRepairLocalState
     - EmotionalRepairVisibleTask
     - EmotionalRepairPotionBridgeContext
   - Inclure le contrat JSON du doc prompts.
   - Valider les enums et invariants.

2. Dispatcher local
   - Ajouter `skills/emotional_repair/local_dispatcher.ts` ou equivalent.
   - Appeler le modele en JSON strict.
   - Injecter :
     - user_message ;
     - recent_messages ;
     - active emotional repair state ;
     - previous repair summary ;
     - previous potion bridge offer if any ;
     - turn_frame safety/risk ;
     - explicit constraints ;
     - possible potion bridge targets and fields.
   - Le dispatcher ne produit jamais de message visible.

3. Reducer
   - Consommer uniquement le JSON du dispatcher.
   - Appliquer les invariants existants :
     - no_potion bloque reply + suggestion ;
     - no_tool bloque operation suggestions ;
     - no_plan bloque plan/action ;
     - soft_support_only reste sans outil/technique/question ;
     - memory candidates non persistés par défaut ;
     - safety handoff gagne.
   - Choisir visible_task.kind.
   - Produire `potion_bridge_context` quand confirmed_handoff.
   - Ne jamais creer de committed effects.

4. Potion bridge context
   - Pour amour, produire candidats :
     - love_lack_context
     - love_state option dur/seul/vide
   - Pour guerison :
     - recent_hurt
     - dominant_feeling option culpabilite/honte/decouragement/fatigue
   - Pour apaisement :
     - pressure_source
     - pressure_state option stresse/a_cran/submerge
   - Ajouter :
     - origin_flow="emotional_repair"
     - origin_turn_summary
     - emotional_episode.summary
     - emotional_episode.user_words
     - durable_need.kind
     - selected_potion
     - selection_reason
     - handoff_instruction_for_potion_subskill

5. Runtime handoff to select_state_potion
   - Quand emotional_repair reducer sort `handoff_to_potion_flow`, demarrer select_state_potion avec :
     - selected_potion deja connu ;
     - active_subskill_id `select_state_potion.amour|guerison|apaisement` ;
     - potion_bridge_context dans l'etat ;
     - no_chat_mutation preserve.
   - Ne pas refaire passer le message par le dispatcher global comme decideur metier.
   - Si implementation temporaire via exit_memo, le global doit seulement honorer le hint structure et ne pas choisir depuis le texte brut.

6. select_state_potion consumption
   - Modifier l'entree du sous-skill potion pour lire `origin_bridge_context`.
   - Injecter ce contexte dans le prompt local dispatcher potion.
   - Les valeurs du bridge sont des candidates :
     - high confidence + platform usable -> lock possible ;
     - medium -> proposed ;
     - low/missing -> ask_deeper.
   - Le sous-skill ne doit pas demander au user de repeter l'episode complet.
   - Trace : conserver origin_flow, selected_potion, consumed candidates.

7. Visible prompts
   - Ajouter `skills/emotional_repair/visible_agent.ts`.
   - Implementer :
     - soft_presence
     - de_shame
     - separate_fact_from_identity
     - repair_relationship
     - concrete_phrase
     - stabilize_anxiety
     - potion_bridge_offer
     - potion_bridge_choice
     - potion_bridge_handoff
     - ask_gentle_clarification
     - repeat_repair / exit_or_cancel
   - Aucun renderer deterministe nominal.
   - Guard final autorise seulement validation de contrat, no-mutation, no done-language, no forbidden potion.

8. Legacy cleanup
   - `renderer.ts` ne doit plus etre le chemin nominal.
   - Le prompt ancien `EMOTIONAL_REPAIR_PROMPT` peut etre remplace ou limite au dispatcher local.
   - Supprimer toute classification metier par regex si elle existe dans le chemin nominal.
   - Garder uniquement les validations structurelles.

9. Observability
   - Ajouter logs/traces :
     - emotional_repair.local_dispatcher_called
     - emotional_repair.local_dispatcher_result
     - emotional_repair.reducer_result
     - emotional_repair.visible_prompt_called
     - emotional_repair.potion_bridge_offered
     - emotional_repair.potion_bridge_confirmed
     - emotional_repair.handoff_to_select_state_potion
     - select_state_potion.origin_context_consumed

Tests unitaires attendus :

Dispatcher/reducer :
- acute self attack remains emotional repair, no potion.
- shame high dominance blocks potion bridge.
- soft_support_only blocks potion and technique.
- stabilized self-kindness -> potion_bridge_offer amour.
- stabilized painful episode/shame trace -> potion_bridge_offer guerison.
- stabilized pressure/tension -> potion_bridge_offer apaisement.
- user confirms offered potion -> handoff_to_potion_flow.
- no_potion confirmation cancels bridge.
- safety_preempt wins.

Bridge context :
- amour context fills love_lack_context and love_state candidate.
- guerison context fills recent_hurt and dominant_feeling candidate.
- apaisement context fills pressure_source and pressure_state candidate.
- origin_flow is emotional_repair.
- user_words are carried without identity-freeze persistence.
- no_chat_mutation flags remain false.

select_state_potion consumption :
- bridge amour starts select_state_potion.amour without global rerouting.
- high confidence bridge field can lock.
- medium confidence bridge field becomes proposed.
- low confidence bridge field asks one clarification.
- sous-skill does not ask user to repeat the full emotional episode.
- apply_attempt after bridge still does not mutate.

Visible prompts :
- no template required.
- no activation wording.
- no wrong potion names.
- no potion mention when no_potion.
- no plan/protocol when forbidden.

QA runs recommandes :

1. Self harshness -> amour
   User: "je me parle super durement depuis mon erreur, j'ai besoin d'un truc plus doux"
   Expected: emotional repair first, then offer Potion d'amour only after stabilization.

2. Shame episode -> guerison
   User: "j'ai honte de mon craquage d'hier, je veux arreter de me punir"
   Expected: bridge candidate guerison with recent_hurt and dominant_feeling=honte.

3. Pressure -> apaisement
   User: "je suis encore a cran, la pression de cette semaine me serre partout"
   Expected: bridge candidate apaisement with pressure_source and pressure_state=a_cran.

4. Refuse potion
   User: "pas de potion, reste juste avec moi"
   Expected: no_potion, soft presence, no bridge.

5. Confirm bridge
   After offer Potion d'amour, user: "oui"
   Expected: handoff_to_select_state_potion with origin_flow emotional_repair and no global semantic reroute.

Definition of done :
- emotional_repair local dispatcher exists.
- active emotional repair skips global dispatcher normal.
- visible prompts replace renderer nominal.
- potion bridge context is structured and consumed by select_state_potion.
- Only amour/guerison/apaisement are bridgeable from emotional_repair.
- No durable effect is possible.
- Tests and a short QA report are added.
```

