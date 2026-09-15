# Bug Sheet - emotional_repair Local Real R1

## ER-R1-B1 - Emotional repair captured by flow opportunity instead of target skill

- Bug id: `ER-R1-B1`
- Tours: 1, 3
- Famille: `BF-ROUTE-01`
- Severite: P1
- Statut: `open`
- Domaine owner: dispatcher global / route policy / `flow_opportunity_verification`
- Source amont: ownership arbitration for sensitive emotional-repair intents.
- Symptome visible: Sophia donne une reponse humaine acceptable mais propose ou garde une confirmation de flow alors que l'utilisateur demande surtout une presence douce.
- Preuve systeme: `response_owner=tool_skill`, `selected_handler=flow_opportunity_verification`, `route_reason=skill_entry_signal`; `emotional_repair` n'apparait pas comme owner du tour.
- Correction attendue: router honte / self-attack non-imminente vers `emotional_repair` comme skill conversationnel cible, ou creer une opportunity canonique qui lance ce skill sans rester bloquee dans la confirmation generique.
- Statut QA: YELLOW dans le run, bloquant indirect car le flow implemente n'est pas exerce.
- Fix reference: a renseigner.
- Tests requis: run reel avec honte explicite; paraphrase "je suis nul"; refus explicite de protocole; verification que le selected handler final est `emotional_repair` ou que le target flow est lance sans erreur.

## ER-R1-B2 - Target flow launch fails after confirmation

- Bug id: `ER-R1-B2`
- Tours: 2, 4
- Famille: `BF-STATE-01`
- Severite: P0
- Statut: `open`
- Domaine owner: `flow_opportunity_verification` local dispatcher / target-flow launch bridge.
- Source amont: reducer or launch bridge for conversation-skill targets.
- Symptome visible: Sophia dit "Je garde l'idee, mais je n'arrive pas a lancer le flow cible correctement sur ce tour." dans un moment emotionnel sensible.
- Preuve systeme: `route_reason=active_flow_opportunity_verification_local_dispatcher`, `tool_status=blocked`, `blocked_effects=[{ type: "target_flow", reason_code: "target_flow_launch_failed" }]`, no executed tools, no committed effects.
- Correction attendue: rendre le lancement cible contractuel pour `emotional_repair` et les conversation skills; si le launch echoue, produire une reponse de presence non technique sans claim durable, puis journaliser l'erreur.
- Statut QA: RED.
- Fix reference: a renseigner.
- Tests requis: test contractuel du launcher `flow_opportunity_verification -> emotional_repair`; run reel `/functions/v1/test-send-message` avec `force_full_ai=true`; paraphrase d'acceptation tardive; anti-regression garantissant que `target_flow_launch_failed` n'est jamais rendu au user.

## ER-R1-B3 - Bridge potion impossible to validate because upstream flow never starts

- Bug id: `ER-R1-B3`
- Tours: 4
- Famille: `BF-STATE-01`
- Severite: P1
- Statut: `open`
- Domaine owner: `flow_opportunity_verification` launch bridge, then `emotional_repair -> select_state_potion` handoff.
- Source amont: same launch failure as `ER-R1-B2`; downstream bridge remains untested.
- Symptome visible: l'utilisateur accepte une "suite douce" en demandant de ne pas raconter tout l'episode; Sophia repond avec l'erreur de lancement au lieu de proposer une suite.
- Preuve systeme: tour 4 blocked effect `target_flow_launch_failed`; aucun signal observe vers `select_state_potion`; aucun `origin_bridge_context` verifiable dans la trace de run.
- Correction attendue: corriger d'abord le launch vers `emotional_repair`, puis verifier que le handoff vers potion transmet le contexte de honte / auto-attaque sans redemander l'episode.
- Statut QA: RED.
- Fix reference: a renseigner.
- Tests requis: run reel en deux temps: emotional repair visible, puis acceptation d'une suite potion; verifier absence de redemande de l'episode et presence du contexte bridge dans le sous-skill.

## Artefacts

- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-emotional-repair-local-real-r1.md`
- Raw: `tests/real-personas/alex/runs/emotional_repair/2026-06-08-emotional-repair-local-real-r1.raw.json`
- Summary: `tests/real-personas/alex/runs/emotional_repair/2026-06-08-emotional-repair-local-real-r1.summary.json`
- Cleanup: `tests/real-personas/alex/runs/emotional_repair/2026-06-08-emotional-repair-local-real-r1.cleanup.json`
