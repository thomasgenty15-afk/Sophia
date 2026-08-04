# Bug Sheet - prepare_attack_card local dispatcher r5

## R5-B01

- Bug id: `R5-B01`
- Tours: Tour 1
- Famille: `BF-STATE-03` - Draft lifecycle casse
- Domaine owner: `prepare_attack_card`
- Source amont: agent visible `ask_or_confirm_technique` et guard `premature_platform_handoff`
- Symptome visible: Sophia repond qu'elle garde la carte en cours mais qu'elle n'arrive pas a formuler la reponse visible.
- Preuve systeme: `selected_handler=prepare_attack_card`; `flow_action=confirm_technique_proposal`; `visible_task=ask_or_confirm_technique`; visible attempts 1 et 2 rejetes avec `premature_platform_handoff:Cartes d'attaque` et `premature_platform_handoff:Cartes d’attaque`; `reason_code=prepare_attack_card_visible_agent_failed`; `executed_tools=[]`; `committed_effects=[]`.
- Correction attendue: le stage visible d'intake ne doit jamais mentionner la destination plateforme ni le brouillon. Retirer cette information du contexte visible ou renforcer le prompt/retry pour la proscrire explicitement.
- Statut: `open`
- Fix reference: a definir
- Tests requis:
  - positif: premier tour cible+piege doit produire une question/proposition technique acceptee;
  - paraphrase: meme intention avec autre action et autre piege;
  - anti-faux-positif: `handoff_ready` doit encore mentionner `Cartes d'attaque`;
  - integration: run IA reel `force_full_ai=true`, `visible_stage complete`, aucun `prepare_attack_card_visible_agent_failed`.

## R5-B02

- Bug id: `R5-B02`
- Tours: Tour 6
- Famille: `BF-INTAKE-06` - Mauvais domaine semantique
- Domaine owner: `prepare_attack_card`
- Source amont: agent visible `handoff_ready`
- Symptome visible: Sophia dit "Tout est pret pour ton rappel" alors que le flow concerne une carte d'attaque.
- Preuve systeme: `stage=handoff_ready`; `toolExecution=platform_handoff`; `selected_handler=prepare_attack_card`; reponse visible contient "rappel"; `executed_tools=[]`; `committed_effects=[]`.
- Correction attendue: ajouter une contrainte de domaine visible: parler uniquement de carte d'attaque / technique / section Cartes d'attaque, jamais de rappel, potion, plan ou autre surface.
- Statut: `open`
- Fix reference: a definir
- Tests requis:
  - positif: handoff ready ne contient pas "rappel";
  - paraphrase: handoff avec une autre technique;
  - anti-faux-positif: les tool skills de rappel peuvent toujours dire "rappel";
  - integration: handoff IA reel accepte et no-mutation.

## R5-B03

- Bug id: `R5-B03`
- Tours: Tour 8
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `prepare_attack_card`
- Source amont: dispatcher local, choix `repeat_handoff` au lieu de `destination_short`
- Symptome visible: a la question "Je la mets ou exactement ?", Sophia repete tous les champs au lieu de donner une reponse courte de destination.
- Preuve systeme: `flow_action=repeat_handoff`; `visible_task=repeat_handoff`; `reason_code=repeat_platform_handoff`; user demandait uniquement la destination.
- Correction attendue: clarifier dans le prompt local que les demandes "ou je la mets", "c'est dans quelle section", "ou exactement" doivent produire `destination_short`, tandis que `repeat_handoff` est reserve aux demandes de repeter quoi saisir.
- Statut: `open`
- Fix reference: a definir
- Tests requis:
  - positif: destination simple -> `destination_short`;
  - paraphrase: "c'est dans quel onglet ?";
  - anti-faux-positif: "repete ce que je dois saisir" -> `repeat_handoff`;
  - integration: reponse courte sans modifier les valeurs.
