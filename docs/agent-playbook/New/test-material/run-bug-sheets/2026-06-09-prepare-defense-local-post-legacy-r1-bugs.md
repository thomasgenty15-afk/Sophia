# Bug Sheet - prepare-defense-local-post-legacy-r1

## R1-B01

- Bug id: `R1-B01`
- Tours: T6
- Famille: `BF-STATE-03` - Draft lifecycle casse
- Domaine owner: `prepare_attack_card`
- Source amont: visible agent stage `ask_blocker` ou `conversation_context` fourni apres handoff local depuis `prepare_defense_card`
- Symptome visible: Sophia demande correctement le bloqueur pour la carte d'attaque, mais ajoute "reprends le brouillon proposé" alors qu'aucun brouillon de carte d'attaque n'a encore ete propose.
- Preuve systeme:
  - route_reason: `prepare_defense_card_handoff_to_prepare_attack_card`
  - selected_handler: `prepare_attack_card`
  - blocked_paths: `global_dispatcher / prepare_defense_card_handoff_to_prepare_attack_card`
  - attack local dispatcher: `flow_action=continue_local`, `visible_task=ask_blocker`, `target_status=locked`, `blocker_status=missing`
  - committed_effects: `[]`
  - executed_tools: `[]`
  - pending_confirmation: `null`
- Correction attendue: au stage `ask_blocker`, le visible agent de `prepare_attack_card` doit seulement demander le bloqueur manquant. Il ne doit pas mentionner de brouillon, de destination plateforme ou de reprise de carte tant que le handoff attaque n'est pas pret.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - positif: handoff `prepare_defense_card` -> `prepare_attack_card` avec `ask_blocker` produit une question blocker naturelle.
  - negatif: la reponse `ask_blocker` ne contient pas `brouillon`, `reprends`, `Cartes d'attaque`, ni destination plateforme.
  - integration: run QA local defense -> attack verifie global skipped et note_information consommee par `prepare_attack_card`.
