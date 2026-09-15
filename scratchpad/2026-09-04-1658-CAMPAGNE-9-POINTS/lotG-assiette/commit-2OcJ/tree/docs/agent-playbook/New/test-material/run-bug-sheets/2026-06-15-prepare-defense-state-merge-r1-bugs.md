# Run Bug Sheet - prepare-defense-state-merge-r1

## PDF-SM-R1-B01

- Tours: T2
- Famille: `BF-STATE-01` - mauvaise transition de flow
- Domaine owner: `prepare_defense_card` local reducer / server-owned merge
- Source amont: transitions autorisees trop restrictives pour `defense_response_hint_state`
- Symptome visible: le user donne l'action defensive concrete "poser mon sac, boire un verre d'eau, sortir un truc simple du frigo", mais le premier handoff affiche seulement "casser l'automatisme d'ouverture de l'appli".
- Preuve systeme: `state_mutation_audit.restored_fields=["defense_response_hint_state"]`; `rejected_changes=[{ field:"defense_response_hint_state", reason_code:"blocked_by_constraint", attempted_action:"confirm_proposed_field" }]`.
- Correction attendue: permettre a une transition valide de stabilisation/handoff de modifier `defense_response_hint_state` quand le user vient de fournir un hint concret, ou faire produire au dispatcher une `flow_action` qui autorise explicitement cette mutation.
- Statut: open
- Fix reference: n/a
- Tests requis: continuation avec hint concret -> premier handoff conserve le hint exact; confirmation invalide ne detruit pas le hint; destination/apply ne modifient pas le hint.

## PDF-SM-R1-B02

- Tours: T4
- Famille: `BF-STATE-03` - draft lifecycle casse
- Domaine owner: `prepare_defense_card` visible agent
- Source amont: prompt ou `conversation_context` du stage `destination_short`
- Symptome visible: a la question "je la mets ou exactement ?", Sophia repond bien avec la destination mais repete aussi tout le handoff.
- Preuve systeme: trace `reason_code=destination_short`, `state_mutation_audit` sans changement, visible reaffiche `support_need`, contexte de risque et action de defense.
- Correction attendue: rendre le stage `destination_short` strictement court: chemin plateforme, nom de la carte, eventuellement le champ canonique si necessaire, sans repetition complete sauf demande explicite du user.
- Statut: open
- Fix reference: n/a
- Tests requis: "ou je la mets ?" apres handoff -> reponse courte; "redis-moi tout" -> repetition autorisee; pas de mutation d'etat sur destination follow-up.

## PDF-SM-R1-B03

- Tours: T6
- Famille: `BF-ROUTE-02` - ancien flow capture ou contourne une nouvelle intention
- Domaine owner: active flow ownership / routeur runtime
- Source amont: perte de l'active flow entre la lecture canonique et les conversation routers
- Symptome visible: la demande de carte d'attaque est traitee par `prepare_attack_card`, mais sans passage par `prepare_defense_card.local_dispatcher -> exit_to_global_dispatcher -> global_dispatcher`.
- Preuve systeme: `active_flow_debug.read_active_flow_state.active_tool_skill_id=prepare_defense_card`; puis `before_run_conversation_routers.active_tool_skill_id=null`; route finale `tool_skill_intent_start` vers `prepare_attack_card`; `note_information.source_flow_id=global_dispatcher`.
- Correction attendue: si la lecture d'active flow detecte `prepare_defense_card`, ce flow reste owner du tour jusqu'a transition explicite. Le runtime ne doit vider/switcher qu'apres une sortie locale `exit_to_global_dispatcher` avec `note_information`.
- Statut: open
- Fix reference: n/a
- Tests requis: active defense + demande explicite attaque -> defense local appele d'abord, `exit_to_global_dispatcher` tracee, puis global route vers attack; aucun bypass quand `active_tool_skill_id` est detecte; ancien state actif legacy reste lisible ou sort proprement.
