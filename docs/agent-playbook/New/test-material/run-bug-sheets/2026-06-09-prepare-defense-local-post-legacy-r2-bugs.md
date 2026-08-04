# Bug Sheet - prepare-defense-local-post-legacy-r2

## R2-B01

- Bug id: `R2-B01`
- Tours: T2, T4
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `prepare_defense_card`
- Source amont: reducer/runtime result apres `handoff_ready` et `revise_support_need`
- Symptome visible: Sophia donne un handoff plateforme correct, mais la trace expose `status=collecting` et `response_tool_execution=blocked`.
- Preuve systeme:
  - T2: `flow_action=handoff_ready`, `visible_task=handoff_ready`, mais `run_status=collecting`, `tool_execution=blocked`
  - T4: `flow_action=revise_support_need`, `visible_task=handoff_ready`, mais `run_status=collecting`, `tool_execution=blocked`
  - selected_handler: `prepare_defense_card`
  - blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
  - committed_effects: `[]`
  - executed_tools: `[]`
  - pending_confirmation: `null`
- Correction attendue: si `support_need.locked_value` existe et que le visible task est `handoff_ready`, le runtime doit exposer `handoff_delivered/platform_handoff`, y compris apres confirmation courte ou revision.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - confirmation courte d'une proposition -> `status=handoff_delivered`, `toolExecution=platform_handoff`
  - revision apres handoff -> `status=handoff_delivered`, `toolExecution=platform_handoff`
  - anti-regression: `apply_attempt` reste non-mutant et `blocked_effects=create_defense_card`

## R2-B02

- Bug id: `R2-B02`
- Tours: T6
- Famille: `BF-STATE-03` - Draft lifecycle casse
- Domaine owner: `prepare_attack_card`
- Source amont: visible agent stage `confirm_target_candidate` ou `conversation_context.handoff_data.platform_steps` apres handoff local depuis `prepare_defense_card`
- Symptome visible: Sophia confirme la cible attaque mais ajoute "reprends le brouillon proposé" alors que le target est seulement propose et que le blocker manque.
- Preuve systeme:
  - route_reason: `prepare_defense_card_handoff_to_prepare_attack_card`
  - selected_handler: `prepare_attack_card`
  - blocked_paths: `global_dispatcher / prepare_defense_card_handoff_to_prepare_attack_card`
  - attack local dispatcher: `flow_action=confirm_candidate`, `visible_task=confirm_target_candidate`, `target_status=proposed`, `blocker_status=missing`
  - `visible_task_context.handoff_data.platform_steps` contient `reprends le brouillon proposé`
  - committed_effects: `[]`
  - executed_tools: `[]`
  - pending_confirmation: `null`
- Correction attendue: les stages `confirm_target_candidate` et `ask_blocker` ne doivent pas recevoir ou afficher les steps de handoff plateforme; ces steps sont reserves a `handoff_ready`, `repeat_handoff`, `destination_short` et `apply_attempt`.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - handoff defense -> attack avec `confirm_target_candidate` ne contient pas `brouillon`, `reprends`, `Cartes d'attaque`, ni destination plateforme
  - handoff defense -> attack avec `ask_blocker` pose uniquement la question blocker
  - handoff attack ready continue a afficher la destination plateforme
