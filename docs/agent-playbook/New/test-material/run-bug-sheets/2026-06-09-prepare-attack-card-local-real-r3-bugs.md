# Bug Sheet — prepare_attack_card local real R3

## R3-B01

- Tours: T1, T2
- Famille: `BF-STATE-03`
- Domaine owner: `prepare_attack_card`
- Source amont: `visible_task.conversation_context` / prompt visible stage-specific
- Symptome visible: Sophia donne deja les etapes de destination et parle de "brouillon propose" alors que le flow est encore en clarification (`ask_blocker`, puis `ask_or_confirm_technique`).
- Preuve systeme: T1 `visible_task=ask_blocker`, `status=clarifying`, `committed_effects=[]`; T2 `visible_task=ask_or_confirm_technique`, `status=clarifying`, mais reponse visible contient "rends-toi dans la section Cartes d'attaque... reprends le brouillon propose".
- Correction attendue: les stages de clarification ne doivent pas exposer `handoff_data.platform_steps` ni formuler une destination comme si le brouillon etait utilisable. Garder les etapes plateforme uniquement pour `handoff_ready`, `repeat_handoff`, `destination_short` et `apply_attempt`.
- Statut: open
- Fix reference: none
- Tests requis: test visible pour `ask_blocker` et `ask_or_confirm_technique` qui interdit destination/handoff premature; run reel paraphrase.

