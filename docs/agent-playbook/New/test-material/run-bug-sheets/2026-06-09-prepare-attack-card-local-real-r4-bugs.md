# Bug Sheet - prepare_attack_card local dispatcher r4

## R4-B01

- Bug id: `R4-B01`
- Tours: Tour 1
- Famille: `BF-STATE-03` - Draft lifecycle casse
- Domaine owner: `prepare_attack_card`
- Source amont: agent visible stage-specific `ask_or_confirm_technique` et guard `wrong_technique_label`
- Symptome visible: Sophia repond qu'elle garde la carte en cours mais qu'elle n'arrive pas a formuler la reponse visible.
- Preuve systeme: `selected_handler=prepare_attack_card`, `flow_action=choose_technique`, `stage=ask_or_confirm_technique`, `target_status=locked`, `blocker_status=locked`; visible agent attempts 1 et 2 rejetes avec `issues=["wrong_technique_label"]`; `reason_code=prepare_attack_card_visible_agent_failed`; `executed_tools=[]`; `committed_effects=[]`; DB `user_attack_cards` count `0`.
- Correction attendue: aligner le `conversation_context` et le prompt visible avec les labels techniques canoniques exacts, puis ajuster le guard pour valider ces labels sans faux rejet. La correction ne doit pas ajouter de regex metier, de renderer deterministe, de fallback global ou de message visible construit par code.
- Statut: `open`
- Fix reference: a definir
- Tests requis: 
  - positif: demande explicite carte d'attaque avec cible et piege fournis doit atteindre `visible_stage complete` sur `ask_or_confirm_technique`;
  - paraphrase: formulation equivalente sans reprendre le texte du run;
  - anti-faux-positif: une sortie avec label non canonique reste rejetee;
  - integration: run IA reel avec `force_full_ai=true`, `selected_handler=prepare_attack_card`, `executed_tools=[]`, `committed_effects=[]`, aucune creation DB.
