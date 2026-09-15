# Bug Sheet - prepare_attack_card local real R1

Run report:
`docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-prepare-attack-card-local-real-r1.md`

Artifacts:

- Raw: `tests/real-personas/qa-skill/runs/prepare_attack_card/2026-06-08-prepare-attack-card-local-real-r1.raw.json`
- Summary: `tests/real-personas/qa-skill/runs/prepare_attack_card/2026-06-08-prepare-attack-card-local-real-r1.summary.json`
- Durable: `tests/real-personas/qa-skill/runs/prepare_attack_card/2026-06-08-prepare-attack-card-local-real-r1.durable.json`

## R1-B01

- Bug id: `R1-B01`
- Tours: 4
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `prepare_attack_card`
- Source amont: `prepare_attack_card/visible_agent.ts`, guard visible `apply_attempt`
- Symptome visible: apres "Ok cree-la maintenant", Sophia repond qu'elle n'arrive pas a formuler la reponse visible.
- Preuve systeme:
  - `selected_handler=prepare_attack_card`
  - `tool_execution=blocked`
  - `executed_tools=[]`
  - `committed_effects=[]`
  - `reason_code=prepare_attack_card_visible_agent_failed`
  - runtime trace: deux tentatives visible agent rejetees avec `apply_attempt_missing_chat_boundary`
- Correction attendue: le visible agent doit produire une reponse non-mutante acceptee par contrat pour `apply_attempt`, mentionnant clairement que Sophia ne cree pas la carte depuis le chat et redonnant `Cartes d'attaque` + champs.
- Statut: `open`
- Fix reference: a venir
- Tests requis:
  - positif: apply attempt apres handoff rend destination et champs, sans execution;
  - paraphrase: "vas-y ajoute-la", "ok lance";
  - anti-faux-positif: "ou je la mets ?" reste `destination_short`;
  - integration: runtime endpoint ou test injecte visible guard.

## R1-B02

- Bug id: `R1-B02`
- Tours: 7
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: global router + `prepare_attack_card`
- Source amont: branche active locale dans `router/run.ts` et `maybeRunPrepareAttackCardOperation`
- Symptome visible: apres "Laisse tomber la carte ... aide-moi plutot a prioriser", Sophia reste bloquee dans la carte et renvoie une erreur technique.
- Preuve systeme:
  - `selected_handler=prepare_attack_card`
  - `tool_execution=blocked`
  - `reason_code=active_prepare_attack_card_local_runtime_null`
  - runtime trace reduite a `local_runtime_null`; le local dispatcher n'a pas fourni de sortie exploitable.
  - le dispatcher global ne reprend pas le message courant.
- Correction attendue: une sortie explicite du flow doit soit produire `prepare_attack_card_local_exit_to_global_dispatcher` et rerouter le meme message au dispatcher global, soit repondre proprement a l'annulation sans bloquer. L'etat actif ne doit pas capturer une demande nouvelle explicite.
- Statut: `open`
- Fix reference: a venir
- Tests requis:
  - positif: active attack handoff + "laisse tomber, aide-moi a prioriser" sort vers global;
  - paraphrase: "on oublie la carte, on organise ma soiree";
  - anti-faux-positif: "redis-moi quoi mettre" reste dans `prepare_attack_card`;
  - integration: verifier `selected_handler` apres reroute et absence d'effet durable.
